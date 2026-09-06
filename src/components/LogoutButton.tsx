"use client";

import { useState } from "react";

/** Nút đăng xuất: POST /api/auth/logout (xóa session server) rồi về trang đăng nhập. */
export function LogoutButton({ className = "", label = "Đăng xuất" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/dang-nhap";
    }
  }

  return (
    <button type="button" onClick={logout} disabled={busy} className={className || "btn btn-secondary"}>
      {busy ? "Đang thoát..." : label}
    </button>
  );
}
