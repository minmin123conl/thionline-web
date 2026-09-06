import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, extractedItems } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { genAnswers, isAIConfigured, coerceGenAnswer } from "@/lib/ai";
import type { ExtractedQuestion } from "@/lib/types";
import { reserveDocumentAiCall, releaseDocumentAiCall } from "@/lib/ai-usage";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Guardrail chi phí: giới hạn tổng số lượt gọi Gemini cho MỘT tài liệu
 * (cộng cả engine AI khi trích xuất lẫn gen đáp án) — chống phát sinh phí.
 */
const MAX_AI_CALLS_FOR_GEN = 5;
/** Mỗi lần gọi tối đa bao nhiêu câu (đề phòng 1 lần gọi quá dài) */
const MAX_QUESTIONS_PER_CALL = 30;

/**
 * POST /api/documents/[id]/gen-answers
 * Sinh đáp án cho các câu CHƯA có đáp án bằng Gemini (giáo viên chủ động bấm, không tự chạy).
 * body: { seqs?: number[] } — rỗng = tất cả câu đang thiếu đáp án.
 * Cap theo tài liệu (aiCalls) để tránh phát sinh chi phí.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await checkRateLimit(`ai:${user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Bạn đã gọi AI quá nhanh, chờ một phút rồi thử lại" }, { status: 429 });
  }
  if (!isAIConfigured()) {
    return NextResponse.json({ error: "Chưa cấu hình Gemini API key trên máy chủ" }, { status: 503 });
  }

  const docRows = await db.select().from(documents).where(eq(documents.id, params.id));
  const doc = docRows[0];
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  if (user.role !== "ADMIN" && doc.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { seqs?: unknown };
  // seqs = null → sinh cho TẤT CẢ câu đang thiếu đáp án; seqs = [...] → chỉ những câu đó
  const seqs: number[] | null = Array.isArray(body?.seqs)
    ? (body.seqs as unknown[]).map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
    : null;

  let items = await db.select().from(extractedItems).where(eq(extractedItems.documentId, doc.id));
  items = items.filter((it) => {
    const q = it.payload as ExtractedQuestion;
    if (!q || (q.answer ?? null) !== null) return false;
    return seqs ? seqs.includes(it.seq) : true;
  });
  if (items.length === 0) return NextResponse.json({ ok: true, generated: 0, aiCalls: doc.aiCalls });

  // Giới hạn số câu/lần gọi — lấy theo seq tăng dần
  items.sort((a, b) => a.seq - b.seq);
  const batch = items.slice(0, MAX_QUESTIONS_PER_CALL);

  try {
    const aiCalls = await reserveDocumentAiCall(doc.id, "answer", MAX_AI_CALLS_FOR_GEN);
    if (aiCalls === null) {
      return NextResponse.json(
        { error: `Đã đạt giới hạn ${MAX_AI_CALLS_FOR_GEN} lượt gọi AI cho tài liệu này. Nhập đáp án tay ở màn duyệt, hoặc tạo tài liệu mới.` },
        { status: 429 }
      );
    }
    try {
      const out = await genAnswers(
        batch.map((it) => {
          const q = it.payload as ExtractedQuestion;
          return { seq: it.seq, type: q.type, stem: q.stem, options: q.options };
        })
      );
      const bySeq = new Map((out.answers ?? []).map((a) => [a.seq, a.answer]));
      let generated = 0;
      for (const it of batch) {
        const raw = bySeq.get(it.seq);
        if (raw === undefined) continue;
        const q = it.payload as ExtractedQuestion;
        const answer = coerceGenAnswer(q.type, raw);
        if (answer === null) continue; // AI không chắc chắn — để giáo viên tự nhập
        await db
          .update(extractedItems)
          .set({ payload: { ...q, answer, confidence: Math.min(1, Math.max(q.confidence ?? 0, 0.6)) } })
          .where(eq(extractedItems.id, it.id));
        generated += 1;
      }
      return NextResponse.json({ ok: true, generated, aiCalls });
    } catch (e) {
      // Lỗi mạng/rate-limit: hoàn lại lượt đã reserve, không tiêu quota oan
      await releaseDocumentAiCall(doc.id, "answer");
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
