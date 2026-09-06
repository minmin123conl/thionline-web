import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, attempts, classMembers, exams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { startAttempt, sweepExpiredAttempts, type Mode } from "@/lib/attempt";

const schema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("assignment"),
    assignmentId: z.string(),
  }),
  z.object({
    source: z.literal("mock"),
    examId: z.string(),
    mode: z.enum(["MOCK_FULL", "PRACTICE"]),
    practiceSectionId: z.string().optional().nullable(),
  }),
]);

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role !== "STUDENT") return NextResponse.json({ error: "Chỉ học sinh mới có thể vào phòng thi" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });

  await sweepExpiredAttempts(user.id);

  if (parsed.data.source === "assignment") {
    const asRows = await db.select().from(assignments).where(eq(assignments.id, parsed.data.assignmentId));
    const a = asRows[0];
    if (!a) return NextResponse.json({ error: "Không tìm thấy đề được giao" }, { status: 404 });

    const memberRows = await db
      .select()
      .from(classMembers)
      .where(and(eq(classMembers.classId, a.classId), eq(classMembers.userId, user.id)));
    if (memberRows.length === 0) return NextResponse.json({ error: "Bạn không thuộc lớp của đề này" }, { status: 403 });

    const now = new Date();
    if (a.opensAt && now < a.opensAt) {
      return NextResponse.json({ error: `Chưa đến giờ mở đề (${a.opensAt.toLocaleString("vi-VN")})` }, { status: 403 });
    }
    if (a.closesAt && now > a.closesAt) {
      return NextResponse.json({ error: "Đề đã hết hạn nộp" }, { status: 403 });
    }

    const prev = await db
      .select({ id: attempts.id, status: attempts.status })
      .from(attempts)
      .where(and(eq(attempts.assignmentId, a.id), eq(attempts.studentId, user.id)));
    const activeOne = prev.find((p) => p.status === "ACTIVE");
    if (activeOne) return NextResponse.json({ ok: true, attemptId: activeOne.id, resumed: true });
    if (prev.length >= a.attemptsAllowed) {
      return NextResponse.json({ error: `Bạn đã dùng hết ${a.attemptsAllowed} lượt làm` }, { status: 403 });
    }

    try {
      const attemptId = await startAttempt({ examId: a.examId, studentId: user.id, mode: "EXAM", assignmentId: a.id });
      return NextResponse.json({ ok: true, attemptId });
    } catch (e) {
      // Race: 2 request "vào phòng thi" song song tạo 2 lượt ACTIVE -> DB chặn lượt thứ 2.
      if (e instanceof Error && e.message.includes("attempt_active_uq")) {
        const activeRows = await db
          .select({ id: attempts.id })
          .from(attempts)
          .where(and(eq(attempts.assignmentId, a.id), eq(attempts.studentId, user.id), eq(attempts.status, "ACTIVE")));
        if (activeRows[0]) return NextResponse.json({ ok: true, attemptId: activeRows[0].id, resumed: true });
      }
      throw e;
    }
  }

  // mock
  const examRows = await db.select().from(exams).where(eq(exams.id, parsed.data.examId));
  const exam = examRows[0];
  if (!exam || exam.status !== "PUBLISHED" || !exam.templateCode) {
    return NextResponse.json({ error: "Không tìm thấy đề luyện thi" }, { status: 404 });
  }
  const mode: Mode = parsed.data.mode;
  const attemptId = await startAttempt({
    examId: exam.id,
    studentId: user.id,
    mode,
    practiceSectionId: mode === "PRACTICE" ? parsed.data.practiceSectionId ?? null : null,
  });
  return NextResponse.json({ ok: true, attemptId });
}
