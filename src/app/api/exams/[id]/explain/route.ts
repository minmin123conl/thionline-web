import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exams, questions } from "@/lib/db/schema";
import { canManageExam, requireUser } from "@/lib/auth";
import { isAIConfigured, geminiGenerateJSON, buildExplanationPrompt, explanationResponseSchema, parseGeminiJSON } from "@/lib/ai";
import { reserveExamExplanationCall, releaseExamExplanationCall } from "@/lib/ai-usage";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({ questionIds: z.array(z.string()).max(20).optional() });
const MAX_EXPLANATION_CALLS = 20;

/** Sinh giải thích AI (Gemini free tier) — tối đa 20 câu/lần gọi để tránh quá thời gian hàm serverless.
 *  Giải thích sinh lúc duyệt đề → học sinh không phải chờ, không tốn API lúc runtime. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const examRows = await db.select().from(exams).where(eq(exams.id, params.id));
  const exam = examRows[0];
  if (!exam) return NextResponse.json({ error: "Không tìm thấy đề" }, { status: 404 });
  if (!(await canManageExam(user, exam))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await checkRateLimit(`ai:${user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Bạn đã gọi AI quá nhanh, chờ một phút rồi thử lại" }, { status: 429 });
  }
  if (!isAIConfigured()) {
    return NextResponse.json({ error: "Chưa cấu hình Gemini API key (GEMINI_API_KEY) trên máy chủ" }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({ questionIds: undefined })));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });

  let qs = await db.select().from(questions).where(eq(questions.examId, exam.id)).orderBy(asc(questions.position));
  if (parsed.data.questionIds?.length) {
    qs = qs.filter((q) => parsed.data.questionIds!.includes(q.id));
  } else {
    qs = qs.filter((q) => !q.explanation.trim());
  }
  qs = qs.slice(0, 20);
  if (qs.length === 0) return NextResponse.json({ ok: true, generated: 0 });

  let generated = 0;
  const errors: string[] = [];
  for (const q of qs) {
    try {
      const aiCalls = await reserveExamExplanationCall(exam.id, MAX_EXPLANATION_CALLS);
      if (aiCalls === null) {
        errors.push(`Đã đạt giới hạn ${MAX_EXPLANATION_CALLS} lượt sinh giải thích cho đề`);
        break;
      }
      try {
        const out = (await geminiGenerateJSON<{ explanation?: string }>(
          buildExplanationPrompt({
            type: q.type,
            stem: q.stem,
            options: q.options as { id: string; text: string }[],
            answer: q.answer,
            existing: q.explanation,
          })
        )) as unknown;
        const validated = parseGeminiJSON(JSON.stringify(out), explanationResponseSchema);
        if (validated?.explanation?.trim()) {
          await db.update(questions).set({ explanation: validated.explanation.trim() }).where(eq(questions.id, q.id));
          generated++;
        }
      } catch (e) {
        // Lời gọi thất bại — hoàn lại lượt đã reserve
        await releaseExamExplanationCall(exam.id);
        throw e;
      }
    } catch (e) {
      errors.push(`Câu ${q.position}: ${(e as Error).message}`);
    }
  }
  return NextResponse.json({ ok: true, generated, errors, remaining: qs.length - generated });
}
