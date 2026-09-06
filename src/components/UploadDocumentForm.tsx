"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export function UploadDocumentForm({ aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? data.document?.error ?? "Không tải lên được file");
      return;
    }
    router.push(`/giao-vien/so-hoa/${data.document.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="text-sm font-semibold text-slate-700">Tải file đề thi lên để đọc bằng AI</p>
        <p className="mt-1 text-xs text-slate-500">
          Hỗ trợ .docx và .pdf có lớp chữ (không phải bản scan/ảnh) · tối đa 4MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf"
          required
          className="mx-auto mt-3 block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
        />
      </div>
      {!aiConfigured && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Máy chủ chưa có khóa Gemini (GEMINI_API_KEY) — vẫn tải file lên được nhưng chưa đọc thành câu hỏi. Thêm khóa vào
          biến môi trường rồi thử lại.
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Đang đọc file..." : "Tải lên và đọc bằng AI"}
      </Button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
