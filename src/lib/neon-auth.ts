/**
 * Neon Auth (Managed Better Auth) — tích hợp qua proxy route của app.
 *
 * Vì sao không gọi thẳng từ browser: cookie session Neon Auth là HttpOnly trên
 * domain Neon Auth; sign-in response có `token` nhưng thiếu signature để server
 * verify lại. Nên mọi luồng sign-in/sign-up đi qua /api/auth/neon (server-side),
 * server bọc cookie thật (token+signature từ set-cookie) để get-session verify,
 * rồi mới tạo session JWT của app.
 *
 * Client chỉ gọi: POST /api/auth/neon?action=sign-in|sign-up|social-start
 */

export type NeonAuthUser = {
  id: string;
  email: string;
  name: string;
};

export type NeonAuthResult =
  | { ok: true; user: NeonAuthUser }
  | { ok: false; code: string; message: string };

function errMsg(code: unknown, message: unknown, fallback: string): string {
  return (typeof message === "string" && message) || (typeof code === "string" && code) || fallback;
}

/** Đăng nhập email/password qua proxy. Thành công → cookie app session đã set. */
export async function appSignIn(email: string, password: string): Promise<NeonAuthResult> {
  const res = await fetch("/api/auth/neon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sign-in", email, password }),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; user?: NeonAuthUser; code?: string; message?: string }
    | null;
  if (!res.ok || !data?.ok || !data.user) return { ok: false, code: data?.code || "UNKNOWN", message: errMsg(data?.code, data?.message, "Đăng nhập thất bại") };
  return { ok: true, user: data.user };
}

/** Đăng ký email/password qua proxy. Thành công → cookie app session đã set. */
export async function appSignUp(name: string, email: string, password: string): Promise<NeonAuthResult> {
  const res = await fetch("/api/auth/neon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sign-up", name, email, password }),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; user?: NeonAuthUser; code?: string; message?: string }
    | null;
  if (!res.ok || !data?.ok || !data.user) return { ok: false, code: data?.code || "UNKNOWN", message: errMsg(data?.code, data?.message, "Đăng ký thất bại") };
  return { ok: true, user: data.user };
}

/** Bắt đầu Google OAuth: trả URL init để browser chuyển hướng. callbackURL là PATH. */
export async function appStartGoogle(callbackPath: string): Promise<string | null> {
  const res = await fetch("/api/auth/neon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "social-start", provider: "google", callbackURL: callbackPath }),
  });
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  return data?.url ?? null;
}

/** Sau khi Google redirect về: hoàn tất session app (server đọc cookie Neon Auth). */
export async function appFinishGoogle(): Promise<{ ok: boolean; redirect?: string }> {
  const res = await fetch("/api/auth/neon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "finish-google" }),
  });
  return { ok: res.ok, redirect: (await res.json().catch(() => null))?.redirect };
}
