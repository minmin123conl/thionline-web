"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea } from "./ui";

export function BulkStudentsForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: { name: string; username: string }[]; failed: { username: string; reason: string }[] } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const students = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(/[,;\t]/).map((p) => p.trim());
        return { name: parts[0] ?? "", username: parts[1] ?? "" };
      })
      .filter((s) => s.name && s.username);
    const res = await fetch("/api/classes/join", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId, password, students }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setResult({ created: data.created, failed: data.failed });
      router.refresh();
    } else {
      setResult({ created: [], failed: [{ username: "", reason: data.error ?? "Lỗi không xác định" }] });
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Tạo hàng loạt tài khoản học sinh
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold">Tạo hàng loạt tài khoản học sinh</p>
      <p className="mt-1 text-xs text-slate-500">
        Mỗi dòng: <code className="rounded bg-white px-1">Họ tên, tendangnhap</code> — học sinh đăng nhập bằng tên đăng nhập + mật khẩu chung bên dưới.
      </p>
      <div className="mt-3">
        <Field label="Danh sách học sinh">
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Nguyễn Văn An, an.nguyen\nTrần Thị Bình, binh.tran"}
            required
          />
        </Field>
      </div>
      <div className="mt-3 max-w-xs">
        <Field label="Mật khẩu chung" hint="≥6 ký tự — báo cho học sinh đổi sau buổi đầu (phiên bản sau sẽ có tự đổi mật khẩu)">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={loading || !text.trim() || password.length < 6}>
          {loading ? "Đang tạo..." : "Tạo tài khoản & thêm vào lớp"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
      </div>
      {result && (
        <div className="mt-3 text-sm">
          {result.created.length > 0 && (
            <p className="text-emerald-700">
              ✓ Đã tạo {result.created.length} tài khoản: {result.created.map((c) => c.username).join(", ")}
            </p>
          )}
          {result.failed.map((f, i) => (
            <p key={i} className="text-rose-600">✗ {f.username || "Danh sách"}: {f.reason}</p>
          ))}
        </div>
      )}
    </form>
  );
}
