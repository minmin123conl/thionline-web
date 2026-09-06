import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classMembers, classRooms, users } from "@/lib/db/schema";
import { requireUser, hashPassword } from "@/lib/auth";
import { STUDENT_DOMAIN } from "@/lib/constants";

const schema = z.object({ code: z.string().min(4).max(10) });

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role !== "STUDENT") return NextResponse.json({ error: "Chỉ học sinh mới tham gia bằng mã lớp" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mã lớp không hợp lệ" }, { status: 400 });
  const code = parsed.data.code.trim().toUpperCase();

  const rows = await db.select().from(classRooms).where(eq(classRooms.joinCode, code));
  const cls = rows[0];
  if (!cls) return NextResponse.json({ error: "Không tìm thấy lớp với mã này" }, { status: 404 });

  const member = await db
    .insert(classMembers)
    .values({ classId: cls.id, userId: user.id })
    .onConflictDoNothing()
    .returning({ id: classMembers.id });
  if (member.length === 0) return NextResponse.json({ ok: true, alreadyMember: true, className: cls.name });
  return NextResponse.json({ ok: true, className: cls.name });
}

// Giáo viên tạo hàng loạt tài khoản học sinh cho lớp
const bulkSchema = z.object({
  classId: z.string(),
  password: z.string().min(6).max(50),
  students: z
    .array(z.object({ name: z.string().min(2).max(100), username: z.string().min(3).max(30) }))
    .min(1)
    .max(100),
});

export async function PUT(req: NextRequest) {
  let teacher;
  try {
    teacher = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (teacher.role !== "TEACHER" && teacher.role !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ giáo viên được tạo tài khoản học sinh" }, { status: 403 });
  }
  const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ (username 3-30 ký tự, mật khẩu ≥6)" }, { status: 400 });
  }

  const clsRows = await db.select().from(classRooms).where(eq(classRooms.id, parsed.data.classId));
  const cls = clsRows[0];
  if (!cls) return NextResponse.json({ error: "Không tìm thấy lớp" }, { status: 404 });
  if (teacher.role === "TEACHER" && cls.teacherId !== teacher.id) {
    return NextResponse.json({ error: "Lớp không thuộc về bạn" }, { status: 403 });
  }

  const hash = await hashPassword(parsed.data.password);
  const created: { name: string; username: string }[] = [];
  const failed: { username: string; reason: string }[] = [];

  for (const s of parsed.data.students) {
    const username = s.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (username.length < 3) {
      failed.push({ username: s.username, reason: "Tên đăng nhập không hợp lệ (chỉ gồm a-z, 0-9, . _ -)" });
      continue;
    }
    const email = username + STUDENT_DOMAIN;
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists.length > 0) {
      const member = await db
        .insert(classMembers)
        .values({ classId: cls.id, userId: exists[0].id })
        .onConflictDoNothing()
        .returning({ id: classMembers.id });
      if (member.length > 0) created.push({ name: s.name, username });
      else failed.push({ username, reason: "Đã ở trong lớp" });
      continue;
    }
    const u = await db
      .insert(users)
      .values({ name: s.name.trim(), email, passwordHash: hash, role: "STUDENT" })
      .returning({ id: users.id });
    await db.insert(classMembers).values({ classId: cls.id, userId: u[0].id }).onConflictDoNothing();
    created.push({ name: s.name, username });
  }
  return NextResponse.json({ ok: true, created, failed });
}
