import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@/lib/db";
import { exams, questions, sections } from "@/lib/db/schema";
import { canManageExam, requireUser } from "@/lib/auth";
import type { SectionDraft } from "@/lib/exam-validation";

const questionSchema = z.object({
  type: z.enum(["MC4", "FILL", "TRUE_FALSE"]),
  stem: z.string().max(20000),
  options: z.array(z.object({ id: z.string().max(4), text: z.string().max(5000) })).max(6).optional(),
  answer: z.unknown().optional(),
  explanation: z.string().max(20000).optional(),
  points: z.number().min(0.25).max(100).optional(),
  isTrial: z.boolean().optional(),
});

const contentSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().optional(),
        code: z.string().max(30).optional(),
        title: z.string().min(1).max(200).optional(),
        minutes: z.number().int().min(1).max(600).optional(),
        questions: z.array(questionSchema).max(200),
      })
    )
    .min(1)
    .max(10),
});

/** Lưu toàn bộ nội dung đề (chỉ khi DRAFT). Thay thế sections+questions, ID sinh phía client-server ổn định. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
  if (exam.status !== "DRAFT") {
    return NextResponse.json({ error: "Đề đã phát hành không thể sửa nội dung" }, { status: 400 });
  }

  const parsed = contentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nội dung đề không hợp lệ" }, { status: 400 });

  const isTemplate = Boolean(exam.templateCode);
  const existing = await db.select().from(sections).where(eq(sections.examId, exam.id)).orderBy(asc(sections.position));

  const draftSections: SectionDraft[] = [];
  const newSections: {
    id: string;
    examId: string;
    code: string;
    title: string;
    position: number;
    minutes: number;
  }[] = [];

  parsed.data.sections.forEach((s, i) => {
    if (isTemplate) {
      // đề theo khuôn: giữ nguyên cấu trúc phần từ template, chỉ nhận câu hỏi theo section id
      const target = s.id ? existing.find((e) => e.id === s.id) : existing[i];
      if (!target) return;
      newSections.push({ ...target, position: i + 1 });
      draftSections.push({ ...s, code: target.code, title: target.title });
    } else {
      newSections.push({
        id: s.id && existing.some((e) => e.id === s.id) ? s.id : crypto.randomUUID(),
        examId: exam.id,
        code: s.code ?? `PART${i + 1}`,
        title: s.title?.trim() || `Phần ${i + 1}`,
        position: i + 1,
        minutes: s.minutes ?? exam.totalMinutes ?? 45,
      });
      draftSections.push(s);
    }
  });

  const newQuestions = newSections.flatMap((sec, si) =>
    (draftSections[si].questions ?? []).map((q, qi) => ({
      id: crypto.randomUUID(),
      examId: exam.id,
      sectionId: sec.id,
      position: qi + 1,
      type: q.type,
      stem: q.stem,
      options: (q.options ?? []) as never,
      answer: (q.answer ?? null) as never,
      explanation: q.explanation ?? "",
      points: q.points ?? 1,
      isTrial: q.isTrial ?? false,
      confidence: null,
      sourcePage: null,
      sourceBBox: null,
    }))
  );

  // neon-http không có transaction tương tác → batch atomic
  const ops = [
    db.delete(sections).where(eq(sections.examId, exam.id)), // questions cascade theo FK
    db.insert(sections).values(newSections),
  ];
  if (newQuestions.length > 0) ops.push(db.insert(questions).values(newQuestions) as never);
  const totalMinutes = isTemplate
    ? exam.totalMinutes
    : parsed.data.sections.length === 1
      ? parsed.data.sections[0].minutes ?? exam.totalMinutes
      : newSections.reduce((a, s) => a + s.minutes, 0);
  ops.unshift(
    db.update(exams).set({ totalMinutes: totalMinutes ?? undefined } as never).where(eq(exams.id, exam.id)) as never
  );
  await (db as unknown as { batch: (ops: unknown[]) => Promise<unknown> }).batch(ops);

  return NextResponse.json({ ok: true, sections: newSections.length, questions: newQuestions.length });
}
