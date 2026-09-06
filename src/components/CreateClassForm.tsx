"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "./ui";

export function CreateClassForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; joinCode: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Không tạo được lớp");
      return;
    }
    setCreated({ name: data.classRoom.name, joinCode: data.classRoom.joinCode });
    setName("");
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={submit} className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Tên lớp">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Toán 12A1 — Ca tối 3-5" required minLength={2} />
          </Field>
        </div>
        <Button type="submit" disabled={loading || name.length < 2}>
          {loading ? "Đang tạo..." : "Tạo lớp"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {created && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Đã tạo lớp <b>{created.name}</b>. Mã tham gia:{" "}
          <span className="rounded bg-white px-2 py-0.5 font-mono font-bold tracking-widest">{created.joinCode}</span>{" "}
          — gửi mã này cho học sinh.
        </p>
      )}
    </div>
  );
}
