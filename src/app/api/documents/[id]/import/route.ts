import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@/lib/db";
import { documents, exams, extractedItems, questions, sections } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import type { ExtractedQuestion } from "@/lib/ai";

const schema = z.object({
  title: z.string().min(3).max(200),
  minutesPerSection: z.number().int().min(1).max(300).optional().default(45),
});

/** Nhập các câu đã duyệt (APPROVED/EDITED) thành đề DRAFT — giáo viên tinh chỉnh tiếp ở màn soạn đề rồi mới phát hành */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const docRows = await db.select().from(documents).where(eq(documents.id, params.id));
  const doc = docRows[0];
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  if (user.role === "STUDENT" || (user.role !== "ADMIN" && doc.teacherId !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tiêu đề đề thi không hợp lệ (≥3 ký tự)" }, { status: 400 });

  const items = await db.select().from(extractedItems).where(eq(extractedItems.documentId, doc.id));
  const approved = items
    .filter((i) => i.status === "APPROVED" || i.status === "EDITED")
    .sort((a, b) => a.seq - b.seq);
  if (approved.length === 0) {
    return NextResponse.json({ error: "Chưa có câu nào được duyệt" }, { status: 400 });
  }

  // Gom nhóm theo sectionGuess (AI đoán phần/chủ đề) — không có thì 1 phần duy nhất
  const groups = new Map<string, ExtractedQuestion[]>();
  for (const it of approved) {
    const q = it.payload as ExtractedQuestion;
    const key = (q.sectionGuess || "").trim() || "Đề thi";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q);
  }

  const examRows = await db
    .insert(exams)
    .values({
      title: parsed.data.title.trim(),
      teacherId: user.role === "ADMIN" ? null : user.id,
      status: "DRAFT",
      documentId: doc.id,
      totalMinutes: parsed.data.minutesPerSection * groups.size,
    })
    .returning();
  const exam = examRows[0];

  const newSections = [...groups.keys()].map((name, i) => ({
    id: crypto.randomUUID(),
    examId: exam.id,
    code: `PART${i + 1}`,
    title: name,
    position: i + 1,
    minutes: parsed.data.minutesPerSection,
  }));

  // duyệt groups theo đúng thứ tự section đã tạo; câu bị bỏ (MC4 thiếu options) được báo lại
  const qValues: {
    id: string; examId: string; sectionId: string; position: number; type: string;
    stem: string; options: never; answer: never; explanation: string; points: number;
    isTrial: boolean; confidence: number | null; sourcePage: number | null; sourceBBox: never;
  }[] = [];
  const skipped: number[] = [];
  let gi = 0;
  for (const [, list] of groups) {
    const sec = newSections[gi++];
    let position = 0;
    list.forEach((q, qi) => {
      const type = q.type === "MC4" || q.type === "FILL" || q.type === "TRUE_FALSE" ? q.type : "MC4";
      let options = q.options ?? [];
      let answer = q.answer ?? null;
      if (type === "MC4") {
        if (options.length < 2) {
          skipped.push(qi + 1);
          return;
        }
        options = options.slice(0, 4).map((o, oi) => ({ id: o.id || "ABCD"[oi], text: o.text }));
        if (typeof answer !== "string" || !options.some((o) => o.id === answer)) answer = null;
      }
      position += 1;
      qValues.push({
        id: crypto.randomUUID(),
        examId: exam.id,
        sectionId: sec.id,
        position,
        type,
        stem: q.stem ?? "",
        options: options as never,
        answer: answer as never,
        explanation: q.explanation ?? "",
        points: 1,
        isTrial: false,
        confidence: typeof q.confidence === "number" ? q.confidence : null,
        sourcePage: null,
        sourceBBox: null as never,
      });
    });
  }

  // Không tạo section rỗng: chỉ insert section thực sự có câu hỏi
  const sectionsWithQuestions = new Set(qValues.map((q) => q.sectionId));
  const sectionsToInsert = newSections.filter((s) => sectionsWithQuestions.has(s.id));

  const ops: unknown[] = [];
  if (sectionsToInsert.length > 0) ops.push(db.insert(sections).values(sectionsToInsert));
  if (qValues.length > 0) ops.push(db.insert(questions).values(qValues));
  ops.push(db.update(documents).set({ status: "IMPORTED" }).where(eq(documents.id, doc.id)));
  await (db as unknown as { batch: (ops: unknown[]) => Promise<unknown> }).batch(ops as never);

  return NextResponse.json({
    ok: true,
    examId: exam.id,
    sections: sectionsToInsert.length,
    questions: qValues.length,
    skippedCount: skipped.length,
  });
}
