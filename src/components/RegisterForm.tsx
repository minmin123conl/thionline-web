"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, Input } from "./ui";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Đăng ký thất bại");
      setLoading(false);
      return;
    }
    router.push(data.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Họ và tên">
        <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </Field>
      <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </Field>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Đang tạo tài khoản..." : "Đăng ký tài khoản học sinh"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Đã có tài khoản?{" "}
        <Link href="/dang-nhap" className="font-medium text-blue-700 hover:underline">
          Đăng nhập
        </Link>
      </p>
      <p className="text-center text-xs text-slate-400">
        Tài khoản giáo viên do quản trị viên cấp — liên hệ trung tâm của bạn.
      </p>
    </form>
  );
}
