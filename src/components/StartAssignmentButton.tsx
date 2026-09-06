"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export function StartAssignmentButton({
  assignmentId,
  label = "Vào làm bài",
  variant = "primary",
}: {
  assignmentId: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/attempts/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "assignment", assignmentId }),
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
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant={variant} onClick={start} disabled={loading}>
        {loading ? "Đang mở đề..." : label}
      </Button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
