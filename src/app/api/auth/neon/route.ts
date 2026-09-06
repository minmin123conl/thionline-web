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
 *  - social-start: {provider, callbackURL} → trả URL init Google
 *  - sync-user: {email, neonId, name} — gọi BỞI MIDDLEWARE sau OAuth exchange
 *    (chỉ chấp nhận khi có x-internal-key đúng CRON_SECRET)
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
    | { action?: string; email?: string; password?: string; name?: string; provider?: string; callbackURL?: string; neonId?: string }
    | null;
  const action = body?.action;
  if (!action) return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
  const input = body;
  const origin = appUrl(req);

  try {
    // ---- Đồng bộ user từ middleware (sau OAuth exchange) ----
    if (action === "sync-user") {
      const key = req.headers.get("x-internal-key");
      if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!input.email) return NextResponse.json({ error: "Thiếu email" }, { status: 400 });
      // upsert user theo email (id Neon Auth có thể khác nếu tài khoản local cũ cùng email)
      const existing = await db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
      if (existing.length === 0) {
        if (!input.neonId) return NextResponse.json({ error: "Thiếu neonId" }, { status: 400 });
        await db.insert(users).values({
          id: input.neonId,
          email: input.email.toLowerCase(),
          passwordHash: "neon-auth",
          name: input.name?.trim() || input.email.split("@")[0],
          role: "STUDENT",
        });
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
      const data = (await res.json().catch(() => null)) as
        | { user?: { id: string; email: string; name?: string } | null; code?: string; message?: string }
        | null;
      if (!res.ok || !data?.user) {
        const msg = data?.code === "INVALID_EMAIL_OR_PASSWORD" ? "Email hoặc mật khẩu không đúng" : data?.message || "Đăng nhập thất bại";
        return NextResponse.json({ error: msg, code: data?.code }, { status: 401 });
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

    // ---- Bắt đầu Google OAuth ----
    if (action === "social-start" && input.callbackURL) {
      // callbackURL phải là path tương đối — Neon Auth ghép với Origin
      const cbPath = input.callbackURL.startsWith("/") ? input.callbackURL : new URL(input.callbackURL).pathname;
      const res = await fetch(`${NEON_AUTH_URL}/sign-in/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ provider: input.provider || "google", callbackURL: cbPath }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !data?.url) return NextResponse.json({ error: "Không bắt đầu được OAuth" }, { status: 502 });
      return NextResponse.json({ url: data.url });
    }

    // ---- Hoàn tất Google OAuth (browser quay về kèm cookie Neon Auth) ----
    if (action === "finish-google") {
      const cookie = req.headers.get("cookie") ?? "";
      const neonCookie = cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("__Secure-neon-auth."));
      if (!neonCookie) return NextResponse.json({ error: "Chưa có session Neon Auth" }, { status: 401 });

      const verified = await verifySession(neonCookie);
      if (!verified) return NextResponse.json({ error: "Session Neon Auth không hợp lệ" }, { status: 401 });

      const out = await syncAndCreateSession(verified);
      return NextResponse.json({ ok: true, ...out });
    }

    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Lỗi máy chủ Neon Auth" }, { status: 502 });
  }
}
