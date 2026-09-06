import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware Neon Auth — hoàn tất OAuth session exchange.
 *
 * Khi Google OAuth xong, Neon Auth redirect về app kèm:
 *   ?neon_auth_session_verifier=xxx  + cookie session_challenge (domain app)
 * Middleware này forward NGUYÊN request (query + cookie) sang Neon Auth
 * /get-session; Neon Auth xác thực verifier, set-cookie session thật về
 * cho domain app. Sau đó redirect sang URL đã bỏ query để sạch address bar.
 */

const NEON_AUTH_URL = (process.env.NEON_AUTH_URL || process.env.NEXT_PUBLIC_NEON_AUTH_URL || "").replace(/\/+$/, "");
const VERIFIER_PARAM = "neon_auth_session_verifier";
const COOKIE_PREFIX = "__Secure-neon-auth";

export async function middleware(req: NextRequest) {
  if (!NEON_AUTH_URL) return NextResponse.next();
  const url = req.nextUrl;

  // Chỉ xử lý khi có verifier param
  if (!url.searchParams.has(VERIFIER_PARAM)) return NextResponse.next();

  // Cookie neon-auth trong request (session_challenge cần cho exchange)
  const neonCookies = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .filter((c) => c.startsWith(COOKIE_PREFIX));
  if (!neonCookies || neonCookies.length === 0) {
    // Không có challenge cookie (ví dụ mở link tay) — chỉ bỏ query
    const clean = url.clone();
    clean.search = "";
    return NextResponse.redirect(clean);
  }

  try {
    // Forward request sang Neon Auth get-session, giữ query + cookie
    const upstream = new URL(`${NEON_AUTH_URL}/get-session`);
    upstream.search = url.search;
    const res = await fetch(upstream, {
      headers: {
        cookie: neonCookies.join("; "),
        Origin: url.origin,
        "x-neon-auth-middleware": "true",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      // Exchange thất bại — về trang đăng nhập sạch query
      return NextResponse.redirect(new URL("/dang-nhap", url.origin));
    }

    // Đọc session từ response để đồng bộ ngay vào app
    const sessionData = (await res.json().catch(() => null)) as
      | { user?: { id: string; email: string; name?: string } | null }
      | null;
    const user = sessionData?.user;

    // Xây redirect response về URL sạch (giữ path gốc, bỏ query)
    const clean = url.clone();
    clean.search = "";
    const redirect = NextResponse.redirect(clean);

    // Forward toàn bộ set-cookie của Neon Auth về browser (domain app)
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of setCookies) redirect.headers.append("set-cookie", c);

    // Nếu có user hợp lệ → gọi route nội bộ đồng bộ session app (fire-and-forget
    // qua header đặc biệt không thể giả mạo từ ngoài — dùng secret server)
    if (user?.email) {
      try {
        await fetch(new URL("/api/auth/neon", url.origin), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-key": process.env.CRON_SECRET || "" },
          body: JSON.stringify({ action: "sync-user", email: user.email, neonId: user.id, name: user.name }),
          cache: "no-store",
        });
      } catch {
        // không chặn flow nếu đồng bộ lỗi
      }
    }
    return redirect;
  } catch {
    const clean = url.clone();
    clean.search = "";
    return NextResponse.redirect(clean);
  }
}

export const config = {
  // Chạy cho mọi trang (không cho /api — exchange chỉ xảy ra trên trang)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
