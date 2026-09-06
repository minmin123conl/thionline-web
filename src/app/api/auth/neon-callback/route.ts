import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth";

/**
 * POST /api/auth/neon-callback
 * Sau khi Neon Auth (Better Auth REST) sign-in/sign-up thành công ở client,
 * client gọi route này. Server forward cookie Neon Auth sang /get-session
 * để xác thực session thật, rồi đồng bộ user vào bảng `users` và tạo
 * session JWT của app (giữ nguyên hệ thống role hiện tại).
 */
export async function POST(req: NextRequest) {
  const authUrl = (process.env.NEON_AUTH_URL || process.env.NEXT_PUBLIC_NEON_AUTH_URL || "").replace(/\/+$/, "");
  if (!authUrl) return NextResponse.json({ error: "Máy chủ chưa cấu hình NEON_AUTH_URL" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { name?: string } | null;

  // Forward toàn bộ cookie của request (chứa session Neon Auth) sang /get-session
  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(`${authUrl}/get-session`, {
    headers: { cookie, "Content-Type": "application/json" },
  });
  if (!res.ok) return NextResponse.json({ error: "Không xác thực được session Neon Auth" }, { status: 401 });
  const session = (await res.json().catch(() => null)) as
    | { user?: { id: string; email: string; name?: string } | null }
    | null;
  const neonUser = session?.user;
  if (!neonUser?.email) return NextResponse.json({ error: "Chưa đăng nhập Neon Auth" }, { status: 401 });

  // Đồng bộ vào bảng users — id Neon Auth làm id (1:1), email trùng thì map tài khoản hiện có
  const displayName = body?.name?.trim() || neonUser.name || neonUser.email.split("@")[0];
  const existing = await db.select().from(users).where(eq(users.email, neonUser.email.toLowerCase()));
  let appUser;
  if (existing.length === 0) {
    const inserted = await db
      .insert(users)
      .values({
        id: neonUser.id,
        email: neonUser.email.toLowerCase(),
        passwordHash: "neon-auth", // đăng nhập qua Neon Auth, không dùng password local
        name: displayName,
        role: "STUDENT",
      })
      .returning();
    appUser = inserted[0];
  } else {
    appUser = existing[0];
  }

  await createSession({
    id: appUser.id,
    email: appUser.email,
    name: appUser.name,
    role: appUser.role as "ADMIN" | "TEACHER" | "STUDENT",
  });

  const redirect = appUser.role === "ADMIN" ? "/admin" : appUser.role === "TEACHER" ? "/giao-vien" : "/hoc-sinh";
  return NextResponse.json({ ok: true, redirect });
}
