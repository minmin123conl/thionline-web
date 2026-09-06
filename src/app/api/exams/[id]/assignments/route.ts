import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, classRooms, exams } from "@/lib/db/schema";
import { canManageExam, requireUser } from "@/lib/auth";

const schema = z.object({
  classId: z.string(),
  title: z.string().max(200).optional().default(""),
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  attemptsAllowed: z.number().int().min(1).max(20).optional().default(1),
  revealResult: z.enum(["IMMEDIATE", "AFTER_CLOSE", "MANUAL"]).optional().default("IMMEDIATE"),
});

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
  if (exam.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Phải phát hành đề trước khi giao" }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu giao đề không hợp lệ" }, { status: 400 });

  const clsRows = await db.select().from(classRooms).where(eq(classRooms.id, parsed.data.classId));
  const cls = clsRows[0];
  if (!cls) return NextResponse.json({ error: "Không tìm thấy lớp" }, { status: 404 });
  if (user.role === "TEACHER" && cls.teacherId !== user.id) {
    return NextResponse.json({ error: "Lớp không thuộc về bạn" }, { status: 403 });
  }
  if (parsed.data.opensAt && parsed.data.closesAt && parsed.data.opensAt >= parsed.data.closesAt) {
    return NextResponse.json({ error: "Giờ mở phải trước giờ đóng" }, { status: 400 });
  }

  const inserted = await db
    .insert(assignments)
    .values({
      examId: exam.id,
      classId: cls.id,
      teacherId: user.id,
      title: parsed.data.title || exam.title,
      opensAt: parsed.data.opensAt ? new Date(parsed.data.opensAt) : null,
      closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null,
      attemptsAllowed: parsed.data.attemptsAllowed,
      revealResult: parsed.data.revealResult,
    })
    .returning();
  return NextResponse.json({ ok: true, assignment: inserted[0] });
}
