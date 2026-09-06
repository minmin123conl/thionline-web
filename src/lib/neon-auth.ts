/**
 * Neon Auth (Managed Better Auth) — client helpers gọi qua proxy /api/auth/neon.
 *
 * Mọi luồng sign-in/sign-up/forgot/reset đi qua server proxy để Neon Auth
 * verify session (token+signature) trước khi tạo session JWT của app.
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

/** Yêu cầu email đặt lại mật khẩu (luôn báo thành công — chống dò email). */
export async function appForgotPassword(email: string): Promise<boolean> {
  const res = await fetch("/api/auth/neon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "forgot-password", email }),
  });
  return res.ok;
}

/** Đặt lại mật khẩu bằng token từ email. */
export async function appResetPassword(token: string, newPassword: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/auth/neon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset-password", token, newPassword }),
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: res.ok, message: data?.error };
}
