"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteExamButton({ examId, title }: { examId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm(`Xóa đề nháp “${title}”?`)) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/exams/${examId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Không xóa được");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50"
      >
        {busy ? "Đang xóa..." : "Xóa"}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </span>
  );
}
