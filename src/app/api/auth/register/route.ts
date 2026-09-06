import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, hashPassword } from "@/lib/auth";

// Đăng ký tự do chỉ dành cho HỌC SINH. Giáo viên do quản trị viên tạo.
const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Vui lòng nhập tên (≥2 ký tự), email hợp lệ và mật khẩu ≥8 ký tự" },
      { status: 400 }
    );
  }
  const { name, email, password } = parsed.data;
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (exists.length > 0) {
    return NextResponse.json({ error: "Email này đã được sử dụng" }, { status: 409 });
  }
  const inserted = await db
    .insert(users)
    .values({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await hashPassword(password),
      role: "STUDENT",
    })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
  const user = inserted[0];
  await createSession({ ...user, role: "STUDENT" });
  return NextResponse.json({ ok: true, redirect: "/hoc-sinh" });
}
