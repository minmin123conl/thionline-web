import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";

const NEON_AUTH_URL = (process.env.NEON_AUTH_URL || process.env.NEXT_PUBLIC_NEON_AUTH_URL || "").replace(/\/+$/, "");

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
    .from(users)
    .orderBy(desc(users.createdAt));
  return NextResponse.json({ users: rows });
}

const createSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
});

/**
 * Quản trị viên tạo tài khoản (giáo viên/học sinh/quản trị).
 * Tạo trên Neon Auth trước (để user đăng nhập được), rồi lưu vào bảng users
 * với đúng role.
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole("ADMIN");
  } catch (e) {
    return e as Response;
  }
  if (!NEON_AUTH_URL) return NextResponse.json({ error: "Máy chủ chưa cấu hình NEON_AUTH_URL" }, { status: 503 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ (mật khẩu ≥8 ký tự)" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists.length > 0) return NextResponse.json({ error: "Email đã tồn tại trong hệ thống" }, { status: 409 });

  // 1) Tạo tài khoản trên Neon Auth
  const origin = req.headers.get("origin") || `http://${req.headers.get("host")}`;
  const res = await fetch(`${NEON_AUTH_URL}/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email,
      password: parsed.data.password,
      name: parsed.data.name.trim(),
      callbackURL: origin + "/dang-nhap",
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | { user?: { id: string; email: string; name?: string } | null; code?: string; message?: string }
    | null;

  let neonUserId: string;
  if (res.ok && data?.user?.id) {
    neonUserId = data.user.id;
  } else if (data?.code === "USER_ALREADY_EXISTS") {
    // Email đã có trên Neon Auth (từng tự đăng ký) — map neon user vào bảng users
    const g = await fetch(`${NEON_AUTH_URL}/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email, password: parsed.data.password }),
    });
    const gd = (await g.json().catch(() => null)) as { user?: { id: string } | null } | null;
    if (!g.ok || !gd?.user?.id) {
      return NextResponse.json(
        { error: "Email đã có trên hệ thống xác thực với mật khẩu khác — dùng email khác hoặc yêu cầu người dùng đặt lại mật khẩu" },
        { status: 409 }
      );
    }
    neonUserId = gd.user.id;
  } else {
    return NextResponse.json({ error: data?.message || "Không tạo được tài khoản trên hệ thống xác thực" }, { status: 502 });
  }

  // 2) Lưu vào bảng users với role yêu cầu
  const inserted = await db
    .insert(users)
    .values({
      id: neonUserId,
      name: parsed.data.name.trim(),
      email,
      passwordHash: "neon-auth",
      role: parsed.data.role,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  return NextResponse.json({ ok: true, user: inserted[0] });
}

const patchSchema = z.object({
  userId: z.string(),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
});

/** Đổi vai trò tài khoản */
export async function PATCH(req: NextRequest) {
  try {
    await requireRole("ADMIN");
  } catch (e) {
    return e as Response;
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });

  const updated = await db
    .update(users)
    .set({ role: parsed.data.role })
    .where(eq(users.id, parsed.data.userId))
    .returning({ id: users.id, role: users.role });
  if (updated.length === 0) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
  return NextResponse.json({ ok: true, user: updated[0] });
}

/** Xóa tài khoản (không cho tự xóa chính mình, không xóa admin cuối cùng) */
export async function DELETE(req: NextRequest) {
  let me;
  try {
    me = await requireRole("ADMIN");
  } catch (e) {
    return e as Response;
  }
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Thiếu userId" }, { status: 400 });
  if (userId === me.id) return NextResponse.json({ error: "Không thể xóa chính mình" }, { status: 400 });

  // Chặn xóa nếu đây là admin cuối cùng
  if (me.role === "ADMIN") {
    const target = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    if (target[0]?.role === "ADMIN") {
      const otherAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "ADMIN"), ne(users.id, userId)));
      if (otherAdmins.length === 0) {
        return NextResponse.json({ error: "Không thể xóa quản trị viên cuối cùng" }, { status: 400 });
      }
    }
  }

  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
