"use client";

import { useState } from "react";
import Link from "next/link";
import { appSignUp } from "@/lib/neon-auth";
import { Button, Field, Input } from "./ui";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const r = await appSignUp(name, email, password);
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
        <Field label="Họ và tên">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Nguyễn Văn A" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="ten@domain.com" />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-err">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Đang tạo tài khoản..." : "Đăng ký tài khoản học sinh"}
        </Button>
      </form>
      <p className="text-center text-sm text-ink2">
        Đã có tài khoản?{" "}
        <Link href="/dang-nhap" className="font-semibold text-blu hover:underline">
          Đăng nhập
        </Link>
      </p>
      <p className="text-center text-xs text-ink3">Tài khoản giáo viên do quản trị viên cấp — liên hệ trung tâm của bạn.</p>
    </div>
  );
}
