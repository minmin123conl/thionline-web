"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, Input } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Đăng nhập thất bại");
      setLoading(false);
      return;
    }
    router.push(data.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email hoặc tên đăng nhập">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </Field>
      <Field label="Mật khẩu">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Học sinh chưa có tài khoản?{" "}
        <Link href="/dang-ky" className="font-medium text-blue-700 hover:underline">
          Đăng ký
        </Link>
      </p>
    </form>
  );
}
