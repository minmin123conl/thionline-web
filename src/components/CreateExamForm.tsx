"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "./ui";

type Template = { code: string; name: string; totalMinutes: number; description: string };

export function CreateExamForm({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [totalMinutes, setTotalMinutes] = useState(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tpl = templates.find((t) => t.code === templateCode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        templateCode: templateCode || null,
        totalMinutes: templateCode ? null : totalMinutes,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Không tạo được đề");
      return;
    }
    router.push(`/giao-vien/de-thi/${data.exam.id}`);
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Tạo đề mới</Button>;
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold">Tạo đề mới</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên đề">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Kiểm tra 45 phút — Hàm số" required minLength={3} />
        </Field>
        <Field label="Loại đề" hint={tpl ? `Thời gian cố định ${tpl.totalMinutes} phút theo khuôn thi thật` : "Đề tự do: bạn tự đặt số phần và thời gian"}>
          <Select value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}>
            <option value="">Đề tự do (kiểm tra lớp)</option>
            {templates.map((t) => (
              <option key={t.code} value={t.code}>Đề mô phỏng {t.name}</option>
            ))}
          </Select>
        </Field>
        {!templateCode && (
          <Field label="Tổng thời gian làm bài (phút)">
            <Input type="number" min={1} max={600} value={totalMinutes} onChange={(e) => setTotalMinutes(Number(e.target.value))} />
          </Field>
        )}
      </div>
      <Field label="Mô tả (không bắt buộc)">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading || title.trim().length < 3}>{loading ? "Đang tạo..." : "Tạo và vào soạn đề"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
