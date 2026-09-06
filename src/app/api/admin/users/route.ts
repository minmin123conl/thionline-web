import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole("ADMIN");
  } catch (e) {
    return e as Response;
  }
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users);
  return NextResponse.json({ users: rows });
}

const createSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["TEACHER", "STUDENT"]).default("TEACHER"),
});

/** Quản trị viên tạo tài khoản giáo viên (không có đăng ký công khai cho giáo viên) */
export async function POST(req: NextRequest) {
  try {
    await requireRole("ADMIN");
  } catch (e) {
    return e as Response;
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ (mật khẩu ≥8 ký tự)" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists.length > 0) return NextResponse.json({ error: "Email đã tồn tại" }, { status: 409 });

  const inserted = await db
    .insert(users)
    .values({ name: parsed.data.name.trim(), email, passwordHash: await hashPassword(parsed.data.password), role: parsed.data.role })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  return NextResponse.json({ ok: true, user: inserted[0] });
}
