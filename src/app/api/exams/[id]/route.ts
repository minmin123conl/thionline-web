import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, attempts, exams, questions, sections } from "@/lib/db/schema";
import { canManageExam, requireUser } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const examRows = await db.select().from(exams).where(eq(exams.id, params.id));
  const exam = examRows[0];
  if (!exam) return NextResponse.json({ error: "Không tìm thấy đề" }, { status: 404 });
  if (user.role === "STUDENT" || !(await canManageExam(user, exam))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const secs = await db.select().from(sections).where(eq(sections.examId, exam.id)).orderBy(asc(sections.position));
  const qs = await db.select().from(questions).where(eq(questions.examId, exam.id)).orderBy(asc(questions.position));
  const asgs = await db.select().from(assignments).where(eq(assignments.examId, exam.id));
  return NextResponse.json({ exam, sections: secs, questions: qs, assignments: asgs });
}

const patchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  totalMinutes: z.number().int().min(1).max(600).optional().nullable(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  attemptsAllowed: z.number().int().min(1).max(20).optional(),
  revealResult: z.enum(["IMMEDIATE", "AFTER_CLOSE", "MANUAL"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });

  const isTemplate = Boolean(exam.templateCode);
  const update: Record<string, unknown> = { ...parsed.data };
  // Đề đã publish là immutable với cấu trúc chấm điểm; chỉ cho đổi mô tả & cấu trúc khi còn DRAFT
  if (exam.status === "PUBLISHED") {
    for (const k of ["totalMinutes", "shuffleQuestions", "shuffleOptions"]) delete update[k];
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Đề đã phát hành chỉ sửa được tiêu đề/mô tả" }, { status: 400 });
    }
  }
  if (isTemplate) delete update.totalMinutes; // khuôn quyết định thời lượng

  const updated = await db.update(exams).set(update).where(eq(exams.id, exam.id)).returning();
  return NextResponse.json({ ok: true, exam: updated[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
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

  const asg = await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.examId, exam.id));
  const att = await db.select({ id: attempts.id }).from(attempts).where(eq(attempts.examId, exam.id));
  if (asg.length > 0 || att.length > 0 || exam.status === "PUBLISHED") {
    return NextResponse.json({ error: "Chỉ xóa được đề nháp chưa phát hành, chưa giao" }, { status: 400 });
  }
  await db.delete(exams).where(eq(exams.id, exam.id));
  return NextResponse.json({ ok: true });
}
