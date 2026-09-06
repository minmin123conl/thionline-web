/**
 * Neon Auth (Managed Better Auth) — tích hợp bằng REST, không cần SDK.
 * SDK @neondatabase/auth yêu cầu Next >= 16, dự án đang Next 14; Better Auth
 * exposes đầy đủ HTTP endpoint nên gọi trực tiếp là ổn định nhất.
 *
 * Client (browser) gọi thẳng endpoint Neon Auth với credentials: "include"
 * (cookie session do Neon Auth set, cross-origin đã được CORS cho phép).
 * Server verify session qua /get-session khi cần (route neon-callback).
 */

const RAW_URL =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
  process.env.VITE_NEON_AUTH_URL ||
  (typeof window !== "undefined" ? (window as unknown as { ENV_NEON_AUTH_URL?: string }).ENV_NEON_AUTH_URL : undefined);

export const NEON_AUTH_URL = (RAW_URL || "").replace(/\/+$/, "");

if (!NEON_AUTH_URL && typeof console !== "undefined") {
  console.warn("NEON_AUTH_URL chưa cấu hình — đăng nhập Neon Auth sẽ không hoạt động");
}

export type NeonAuthUser = {
  id: string;
  email: string;
  name: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${NEON_AUTH_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => null)) as T;
  return { ok: res.ok, status: res.status, data };
}

/** Đăng ký bằng email/password. Trả về user hoặc message lỗi. */
export async function neonSignUp(input: { email: string; password: string; name: string; callbackURL: string }) {
  return api<{ user?: NeonAuthUser; code?: string; message?: string }>("/sign-up/email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Đăng nhập bằng email/password — Neon Auth set cookie session (httpOnly). */
export async function neonSignIn(input: { email: string; password: string; callbackURL?: string }) {
  return api<{ user?: NeonAuthUser; code?: string; message?: string }>("/sign-in/email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Lấy session hiện tại từ cookie Neon Auth (đã set khi sign-in). */
export async function neonGetSession() {
  return api<{ user?: NeonAuthUser | null }>("/get-session", { method: "GET" });
}

/** Đăng xuất — xóa cookie session Neon Auth. */
export async function neonSignOut() {
  return api<{ success?: boolean }>("/sign-out", { method: "POST", body: "{}" });
}

/** URL bắt đầu Google OAuth flow — browser chuyển hướng sang đây. */
export function neonGoogleSignIn(callbackURL: string) {
  return `${NEON_AUTH_URL}/sign-in/social?provider=google&callbackURL=${encodeURIComponent(callbackURL)}`;
}
