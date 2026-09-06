"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export function StartMockButton({
  examId,
  mode,
  practiceSectionId,
  label,
  confirmMessage,
  variant = "primary",
  className = "",
}: {
  examId: string;
  mode: "MOCK_FULL" | "PRACTICE";
  practiceSectionId?: string;
  label: string;
  confirmMessage?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/attempts/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "mock", examId, mode, practiceSectionId: practiceSectionId ?? null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Không thể bắt đầu");
      setLoading(false);
      return;
    }
    router.push(`/thi/${data.attemptId}`);
  }

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <Button variant={variant} onClick={start} disabled={loading}>
        {loading ? "Đang mở phòng thi..." : label}
      </Button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
