"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { neonSignIn, neonGoogleSignIn, NEON_AUTH_URL } from "@/lib/neon-auth";
import { Button, Field, Input } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Quay lại từ Google OAuth → cookie Neon Auth đã được set → đồng bộ session app
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
      const r = await neonSignIn({ email, password, callbackURL: "/" });
      if (!r.ok || !r.data.user) {
        const msg =
          r.data.code === "INVALID_EMAIL_OR_PASSWORD"
            ? "Email hoặc mật khẩu không đúng"
            : r.data.message || "Đăng nhập thất bại";
        setError(msg);
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/neon-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: r.data.user.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Đồng bộ tài khoản thất bại");
      router.push(data.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
      setLoading(false);
    }
  }

  if (syncing) return <p className="py-8 text-center text-sm text-ink2">Đang hoàn tất đăng nhập Google…</p>;

  return (
    <div className="space-y-4">
      <Button
        variant="secondary"
        onClick={() => (window.location.href = neonGoogleSignIn(window.location.origin + "/dang-nhap"))}
        disabled={loading}
        className="w-full"
      >
        Tiếp tục với Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-ink3">
        <span className="h-px flex-1 bg-line" />
        hoặc dùng email
        <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required placeholder="ten@domain.com" />
        </Field>
        <Field label="Mật khẩu">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••" />
        </Field>
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
