"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Field, Input } from "./ui";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/neon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "forgot-password", email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Không gửi được email — thử lại");
      return;
    }
    // Luôn báo "đã gửi" kể cả email không tồn tại — chống dò email
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-ok">
          Nếu email <b>{email}</b> có tài khoản, thư hướng dẫn đặt lại mật khẩu đã được gửi.
        </p>
        <p className="mt-3 text-xs text-ink3">Kiểm tra thư mục spam. Link hết hạn sau 1 giờ.</p>
        <Link href="/dang-nhap" className="btn btn-secondary mt-5 inline-block">
          ← Về đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email đăng nhập">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="ten@domain.com" autoComplete="username" />
      </Field>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-err">{error}</p>}
      <Button type="submit" disabled={loading || !email} className="w-full">
        {loading ? "Đang gửi..." : "Gửi link đặt lại mật khẩu"}
      </Button>
      <p className="text-center text-sm text-ink2">
        <Link href="/dang-nhap" className="font-semibold text-blu hover:underline">
          ← Quay lại đăng nhập
        </Link>
      </p>
    </form>
  );
}
