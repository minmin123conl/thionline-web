"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { neonSignUp, neonGoogleSignIn, NEON_AUTH_URL } from "@/lib/neon-auth";
import { Button, Field, Input } from "./ui";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Quay lại từ Google OAuth → cookie Neon Auth đã set → đồng bộ session app
  useEffect(() => {
    if (!NEON_AUTH_URL) return;
    (async () => {
      try {
        const res = await fetch("/api/auth/neon-callback", { method: "POST" });
        if (res.ok) {
          setSyncing(true);
          const data = await res.json();
          router.push(data.redirect);
          router.refresh();
        }
      } catch {
        /* chưa có session Neon Auth — bỏ qua */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await neonSignUp({
        email,
        password,
        name,
        callbackURL: window.location.origin + "/dang-ky",
      });
      if (!r.ok || !r.data.user) {
        const msg =
          r.data.code === "USER_ALREADY_EXISTS"
            ? "Email này đã có tài khoản — thử đăng nhập"
            : r.data.code === "WEAK_PASSWORD"
              ? "Mật khẩu chưa đủ mạnh (tối thiểu 8 ký tự)"
              : r.data.message || "Đăng ký thất bại";
        setError(msg);
        setLoading(false);
        return;
      }
      // Sign-up thành công — Neon Auth đã set cookie session → đồng bộ app session
      const res = await fetch("/api/auth/neon-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Đồng bộ tài khoản thất bại");
      router.push(data.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại");
      setLoading(false);
    }
  }

  if (syncing) return <p className="py-8 text-center text-sm text-ink2">Đang hoàn tất đăng ký Google…</p>;

  return (
    <div className="space-y-4">
      <Button
        variant="secondary"
        onClick={() => (window.location.href = neonGoogleSignIn(window.location.origin + "/dang-ky"))}
        disabled={loading}
        className="w-full"
      >
        Đăng ký nhanh với Google
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
