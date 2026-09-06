"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "./ui";

export function CreateUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"TEACHER" | "STUDENT">("TEACHER");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không tạo được tài khoản" });
      return;
    }
    setMsg({ ok: true, text: `Đã tạo tài khoản ${data.user.email}` });
    setName("");
    setEmail("");
    setPassword("");
    router.refresh();
  }

  if (!open) return <Button onClick={() => setOpen(true)}>+ Tạo tài khoản giáo viên</Button>;

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold">Tạo tài khoản</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ tên">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="Vai trò">
          <Select value={role} onChange={(e) => setRole(e.target.value as "TEACHER" | "STUDENT")}>
            <option value="TEACHER">Giáo viên</option>
            <option value="STUDENT">Học sinh</option>
          </Select>
        </Field>
        <Field label="Email đăng nhập">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mật khẩu" hint="≥8 ký tự — gửi riêng cho người nhận, không lưu ở đâu khác">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || password.length < 8 || !email}>
          {busy ? "Đang tạo..." : "Tạo tài khoản"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>}
    </form>
  );
}
