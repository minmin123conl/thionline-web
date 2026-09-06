import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth";

/**
 * POST /api/auth/neon — proxy Neon Auth (Better Auth) cho web app.
 *
 * Server gọi Neon Auth REST với Origin/URL chính xác của app (từ host header
 * hoặc env), tự giữ cookie (token+signature) để verify get-session, đồng bộ
 * user vào bảng `users`, và set session JWT app.
 *
 * action:
 *  - sign-in: {email, password}
 *  - sign-up: {name, email, password}
 *  - forgot-password: {email} → Neon Auth gửi email link đặt lại (anti-enumeration)
 *  - reset-password: {token, newPassword} — token một lần từ email, hết hạn 1 giờ
 */

const NEON_AUTH_URL = (process.env.NEON_AUTH_URL || process.env.NEXT_PUBLIC_NEON_AUTH_URL || "").replace(/\/+$/, "");

/** Origin/URL công khai của app — Neon Auth check trusted_origins theo cái này */
function appUrl(req: NextRequest): string {
  const envUrl = process.env.NEON_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const host = req.headers.get("host") || "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/** Gọi get-session với chuỗi cookie; trả user hoặc null.
 *  Better Auth trả { session: {...}, user: {...} } — user nằm ở TOP-LEVEL. */
async function verifySession(cookieStr: string) {
  try {
    const res = await fetch(`${NEON_AUTH_URL}/get-session`, {
      headers: { cookie: cookieStr },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { user?: { id: string; email: string; name?: string } | null; session?: { user?: unknown } | null }
      | null;
    const user = data?.user ?? (data?.session as { user?: { id: string; email: string; name?: string } } | undefined)?.user ?? null;
    return user;
  } catch {
    return null;
  }
}

/** Đồng bộ Neon Auth user vào bảng users, tạo session app, trả redirect path */
async function syncAndCreateSession(
  neonUser: { id: string; email: string; name?: string },
  nameOverride?: string
) {
  const displayName = nameOverride?.trim() || neonUser.name || neonUser.email.split("@")[0];
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
  return { user: { id: appUser.id, email: appUser.email, name: appUser.name }, redirect };
}

export async function POST(req: NextRequest) {
  if (!NEON_AUTH_URL) return NextResponse.json({ error: "Máy chủ chưa cấu hình NEON_AUTH_URL" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as
    | { action?: string; email?: string; password?: string; name?: string; provider?: string; callbackURL?: string; neonId?: string; token?: string; newPassword?: string }
    | null;
  const action = body?.action;
  if (!action) return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
  const input = body;
  const origin = appUrl(req);

  try {
    // ---- Quên mật khẩu: gửi email đặt lại ----
    if (action === "forgot-password" && input.email) {
      // Neon Auth trả OK kể cả email không tồn tại (chống dò email) —
      // không bao giờ lộ thông tin tài khoản qua response khác nhau.
      const res = await fetch(`${NEON_AUTH_URL}/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email: input.email, callbackURL: "/dat-lai-mat-khau" }),
      });
      if (!res.ok) {
        // Lỗi hệ thống (không phải "email không tồn tại") — vẫn ẩn chi tiết
        return NextResponse.json({ error: "Không gửi được email đặt lại — thử lại sau" }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    // ---- Đặt lại mật khẩu bằng token từ email ----
    if (action === "reset-password" && input.token && input.newPassword) {
      if (input.newPassword.length < 8) {
        return NextResponse.json({ error: "Mật khẩu mới tối thiểu 8 ký tự" }, { status: 400 });
      }
      const res = await fetch(`${NEON_AUTH_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ newPassword: input.newPassword, token: input.token, callbackURL: "/dang-nhap" }),
      });
      const data = (await res.json().catch(() => null)) as { status?: boolean; code?: string; message?: string } | null;
      if (!res.ok) {
        const msg =
          data?.code === "INVALID_TOKEN"
            ? "Link đặt lại không hợp lệ hoặc đã hết hạn — yêu cầu link mới"
            : data?.code === "WEAK_PASSWORD"
              ? "Mật khẩu chưa đủ mạnh (tối thiểu 8 ký tự)"
              : data?.message || "Không đặt lại được mật khẩu";
        return NextResponse.json({ error: msg, code: data?.code }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    // ---- Đăng nhập email/password ----
    if (action === "sign-in" && input.email && input.password) {
      const res = await fetch(`${NEON_AUTH_URL}/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email: input.email, password: input.password }),
      });
      // Đọc text MỘT lần — parse sau (tránh clone body đã consume)
      const rawText = await res.text().catch(() => "");
      let data: { user?: { id: string; email: string; name?: string } | null; code?: string; message?: string } | null = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }
      if (!res.ok || !data?.user) {
        const msg = data?.code === "INVALID_EMAIL_OR_PASSWORD" ? "Email hoặc mật khẩu không đúng" : data?.message || "Đăng nhập thất bại";
        return NextResponse.json(
          { error: msg, code: data?.code, debugOrigin: origin, debugStatus: res.status, debugBody: rawText.slice(0, 300) },
          { status: 401 }
        );
      }
      // Verify session bằng set-cookie (token+signature) — chống token giả mạo
      const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      const sessionCookie = setCookies.find((c) => c.includes("neon-auth.session_token"));
      if (!sessionCookie) return NextResponse.json({ error: "Không xác thực được session" }, { status: 401 });
      const verified = await verifySession(sessionCookie.split(";")[0]);
      if (!verified) return NextResponse.json({ error: "Không xác thực được session" }, { status: 401 });

      const out = await syncAndCreateSession(verified);
      return NextResponse.json({ ok: true, ...out });
    }

    // ---- Đăng ký email/password ----
    if (action === "sign-up" && input.email && input.password && input.name) {
      // callbackURL dùng PATH TƯƠNG ĐỐI — Better Auth ghép với Origin (tránh INVALID_CALLBACK_URL)
      const res = await fetch(`${NEON_AUTH_URL}/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          name: input.name,
          callbackURL: "/dang-ky",
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { user?: { id: string; email: string; name?: string } | null; code?: string; message?: string }
        | null;
      if (!res.ok || !data?.user) {
        const msg =
          data?.code === "USER_ALREADY_EXISTS"
            ? "Email này đã có tài khoản — thử đăng nhập"
            : data?.code === "WEAK_PASSWORD"
              ? "Mật khẩu chưa đủ mạnh (tối thiểu 8 ký tự)"
              : data?.message || "Đăng ký thất bại";
        return NextResponse.json({ error: msg, code: data?.code }, { status: 400 });
      }
      const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      const sessionCookie = setCookies.find((c) => c.includes("neon-auth.session_token"));
      if (!sessionCookie) return NextResponse.json({ error: "Không xác thực được session" }, { status: 401 });
      const verified = await verifySession(sessionCookie.split(";")[0]);
      if (!verified) return NextResponse.json({ error: "Không xác thực được session" }, { status: 401 });

      const out = await syncAndCreateSession(verified, input.name);
      return NextResponse.json({ ok: true, ...out });
    }

    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Lỗi máy chủ Neon Auth" }, { status: 502 });
  }
}
