"use client";

import { useState } from "react";
import Link from "next/link";
import { appSignIn } from "@/lib/neon-auth";
import { Button, Field, Input } from "./ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const r = await appSignIn(email, password);
    if (!r.ok) {
      setError(r.message);
      setLoading(false);
      return;
    }
    // Proxy đã set cookie session app → về trang chủ, home điều hướng theo role
    window.location.href = "/";
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required placeholder="ten@domain.com" />
        </Field>
        <Field label="Mật khẩu">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <div className="text-right">
          <Link href="/quen-mat-khau" className="text-sm font-medium text-blu hover:underline">
            Quên mật khẩu?
          </Link>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-err">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>
      </form>
      <p className="text-center text-sm text-ink2">
        Chưa có tài khoản?{" "}
        <Link href="/dang-ky" className="font-semibold text-blu hover:underline">
          Đăng ký
        </Link>
      </p>
    </div>
  );
}
