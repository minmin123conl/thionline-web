import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

/** Đăng xuất: xóa session app + gọi neonSignOut ở client để clear cookie Neon Auth */
export async function POST(req: NextRequest) {
  destroySession();

  // Nếu có cookie Neon Auth (đăng nhập qua Neon Auth) → forward sign-out cho họ
  const authUrl = (process.env.NEON_AUTH_URL || process.env.NEXT_PUBLIC_NEON_AUTH_URL || "").replace(/\/+$/, "");
  const cookie = req.headers.get("cookie") ?? "";
  if (authUrl && cookie) {
    try {
      await fetch(`${authUrl}/sign-out`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // Không chặn đăng xuất app nếu Neon Auth sign-out lỗi
    }
  }

  return NextResponse.json({ ok: true });
}
