"use client";

import { useState } from "react";

export function CopyCode({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Nhấn để sao chép"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-slate-800 hover:bg-white"
    >
      {code}
      <span className="font-sans text-[11px] font-normal tracking-normal text-slate-500">
        {copied ? "Đã sao chép ✓" : label ?? "Sao chép"}
      </span>
    </button>
  );
}
