"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { appSignUp, appStartGoogle, appFinishGoogle } from "@/lib/neon-auth";
import { Button, Field, Input } from "./ui";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Quay lại từ Google OAuth → hoàn tất session app
  useEffect(() => {
    (async () => {
      const r = await appFinishGoogle();
      if (r.ok && r.redirect) {
        setSyncing(true);
        router.push(r.redirect);
        router.refresh();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function google() {
    setOauthLoading(true);
    setError("");
    const url = await appStartGoogle(window.location.origin + "/dang-ky");
    if (url) window.location.href = url;
    else {
      setError("Không bắt đầu được đăng ký Google");
      setOauthLoading(false);
    }
  }

  if (syncing) return <p className="py-8 text-center text-sm text-ink2">Đang hoàn tất đăng ký Google…</p>;

  return (
    <div className="space-y-4">
      <Button variant="secondary" onClick={google} disabled={loading || oauthLoading} className="w-full">
        {oauthLoading ? "Đang chuyển sang Google..." : "Đăng ký nhanh với Google"}
      </Button>
      <div className="flex items-center gap-3 text-xs text-ink3">
        <span className="h-px flex-1 bg-line" />
        hoặc dùng email
        <span className="h-px flex-1 bg-line" />
      </div>
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
        <Button type="submit" disabled={loading || oauthLoading} className="w-full">
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
