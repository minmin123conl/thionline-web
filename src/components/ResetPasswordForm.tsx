"use client";

import { useState } from "react";
import { Button, Field, Input } from "./ui";

/**
 * Form đặt lại mật khẩu — token đến từ link email (một lần, hết hạn 1 giờ).
 * Sau khi thành công, tự chuyển sang trang đăng nhập với mật khẩu mới.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/neon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-password", token, newPassword: password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Không đặt lại được mật khẩu");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-ok">
          Đã đặt lại mật khẩu thành công. Dùng mật khẩu mới để đăng nhập.
        </p>
        <a href="/dang-nhap" className="btn btn-primary mt-5 inline-block">
          Đăng nhập ngay
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="••••••••" />
      </Field>
      <Field label="Nhập lại mật khẩu mới">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="••••••••" />
      </Field>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-err">{error}</p>}
      <Button type="submit" disabled={loading || password.length < 8 || confirm.length < 8} className="w-full">
        {loading ? "Đang đặt lại..." : "Đặt lại mật khẩu"}
      </Button>
    </form>
  );
}
