"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "./ui";

export function JoinClassForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch("/api/classes/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không tham gia được" });
      return;
    }
    setMsg({ ok: true, text: data.alreadyMember ? `Bạn đã ở trong lớp ${data.className}` : `Đã vào lớp ${data.className}` });
    setCode("");
    router.refresh();
  }

  return (
    <form onSubmit={join} className="flex items-end gap-3">
      <div className="w-40">
        <Field label="Mã lớp">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="VD: ABC123"
            maxLength={6}
            className="font-mono uppercase tracking-widest"
          />
        </Field>
      </div>
      <Button type="submit" disabled={loading || code.length < 4}>
        {loading ? "Đang kiểm tra..." : "Tham gia"}
      </Button>
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</span>}
    </form>
  );
}
