"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "./ui";

type ClassOption = { id: string; name: string };

export function AssignExamForm({ examId, classes }: { examId: string; classes: ClassOption[] }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [revealResult, setRevealResult] = useState("IMMEDIATE");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/exams/${examId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        title,
        opensAt: opensAt ? new Date(opensAt).toISOString() : null,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
        attemptsAllowed,
        revealResult,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không giao được đề" });
      return;
    }
    setMsg({ ok: true, text: "Đã giao đề cho lớp ✓" });
    setTitle("");
  }

  if (classes.length === 0) {
    return <p className="text-sm text-slate-500">Chưa có lớp nào — tạo lớp trước khi giao đề.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lớp nhận đề">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tiêu đề hiển thị với học sinh" hint="Để trống thì dùng tên đề">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Kiểm tra giữa kỳ lần 1" />
        </Field>
        <Field label="Giờ mở (tùy chọn)">
          <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </Field>
        <Field label="Hạn nộp (tùy chọn)">
          <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </Field>
        <Field label="Số lượt làm cho phép">
          <Input type="number" min={1} max={20} value={attemptsAllowed} onChange={(e) => setAttemptsAllowed(Number(e.target.value))} />
        </Field>
        <Field label="Hiện kết quả cho học sinh">
          <Select value={revealResult} onChange={(e) => setRevealResult(e.target.value)}>
            <option value="IMMEDIATE">Ngay sau khi nộp</option>
            <option value="AFTER_CLOSE">Sau khi hết hạn nộp</option>
            <option value="MANUAL">Khi giáo viên cho phép (chưa hỗ trợ bật tay — dùng AFTER_CLOSE)</option>
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={loading || !classId}>{loading ? "Đang giao..." : "Giao đề cho lớp"}</Button>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>}
    </form>
  );
}
