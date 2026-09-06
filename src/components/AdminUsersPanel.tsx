"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select } from "./ui";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = { ADMIN: "Quản trị", TEACHER: "Giáo viên", STUDENT: "Học sinh" };

export function AdminUsersPanel({ initialUsers, meId }: { initialUsers: AdminUserRow[]; meId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function changeRole(userId: string, role: string) {
    setBusyId(userId);
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Không đổi được vai trò");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: data.user.role } : u)));
    router.refresh();
  }

  async function removeUser(userId: string, name: string) {
    if (!window.confirm(`Xóa tài khoản "${name}"? Hành động không thể hoàn tác.`)) return;
    setBusyId(userId);
    setError("");
    const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Không xóa được tài khoản");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    router.refresh();
  }

  function onCreated(u: AdminUserRow) {
    setUsers((prev) => [u, ...prev]);
    setShowCreate(false);
    router.refresh();
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tài khoản ({users.length})</h2>
        <Button onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Đóng form" : "+ Tạo tài khoản"}</Button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-err">{error}</p>}

      {showCreate && (
        <div className="mt-3">
          <CreateUserForm onCreated={onCreated} />
        </div>
      )}

      <Card className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              <th className="px-4 py-3 font-medium">Họ tên</th>
              <th className="px-4 py-3 font-medium">Đăng nhập</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              <th className="px-4 py-3 font-medium">Tạo ngày</th>
              <th className="px-4 py-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className={busyId === u.id ? "opacity-50" : ""}>
                <td className="px-4 py-2.5 font-medium text-ink">
                  {u.name}
                  {u.id === meId && <span className="ml-2 text-xs text-ink3">(bạn)</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink2">{u.email}</td>
                <td className="px-4 py-2.5">
                  {u.id === meId ? (
                    <Badge color={u.role === "ADMIN" ? "red" : u.role === "TEACHER" ? "blue" : "slate"}>{ROLE_LABEL[u.role]}</Badge>
                  ) : (
                    <Select
                      value={u.role}
                      disabled={busyId === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      className="!w-auto !py-1 text-xs"
                      aria-label={`Vai trò của ${u.name}`}
                    >
                      <option value="ADMIN">Quản trị</option>
                      <option value="TEACHER">Giáo viên</option>
                      <option value="STUDENT">Học sinh</option>
                    </Select>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink3">{new Date(u.createdAt).toLocaleDateString("vi-VN")}</td>
                <td className="px-4 py-2.5 text-right">
                  {u.id !== meId && (
                    <Button variant="ghost" disabled={busyId === u.id} onClick={() => removeUser(u.id, u.name)} className="!px-2 !py-1 text-xs text-seal">
                      Xóa
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-ink3">
        Đổi vai trò áp dụng ngay. Tài khoản được tạo trên hệ thống xác thực Neon Auth — người dùng đăng nhập bằng email/mật khẩu hoặc Google.
      </p>
    </section>
  );
}

function CreateUserForm({ onCreated }: { onCreated: (u: AdminUserRow) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"TEACHER" | "STUDENT" | "ADMIN">("TEACHER");
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
    onCreated({ ...data.user, createdAt: new Date().toISOString() });
    setMsg({ ok: true, text: `Đã tạo tài khoản ${data.user.email}` });
    setName("");
    setEmail("");
    setPassword("");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-4">
      <p className="text-sm font-semibold text-ink">Tạo tài khoản mới</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ tên">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Nguyễn Văn A" />
        </Field>
        <Field label="Vai trò">
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="TEACHER">Giáo viên</option>
            <option value="STUDENT">Học sinh</option>
            <option value="ADMIN">Quản trị</option>
          </Select>
        </Field>
        <Field label="Email đăng nhập">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="ten@domain.com" />
        </Field>
        <Field label="Mật khẩu" hint="≥8 ký tự — gửi riêng cho người nhận, không lưu ở đâu khác">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="MậtKhẩuMới123" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || password.length < 8 || !email || name.trim().length < 2}>
          {busy ? "Đang tạo..." : "Tạo tài khoản"}
        </Button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-err"}`}>{msg.text}</p>}
    </form>
  );
}
