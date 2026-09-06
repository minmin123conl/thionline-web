"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavUser = { name: string; role: "ADMIN" | "TEACHER" | "STUDENT" };

const NAV: Record<string, { href: string; label: string }[]> = {
  STUDENT: [
    { href: "/hoc-sinh", label: "Trang chủ" },
    { href: "/hoc-sinh/lop", label: "Lớp của tôi" },
    { href: "/phong-thi", label: "Phòng thi thực chiến" },
  ],
  TEACHER: [
    { href: "/giao-vien", label: "Trang chủ" },
    { href: "/giao-vien/de-thi", label: "Đề thi" },
    { href: "/giao-vien/lop", label: "Lớp học" },
    { href: "/giao-vien/so-hoa", label: "Số hóa đề" },
  ],
  ADMIN: [
    { href: "/admin", label: "Quản trị" },
    { href: "/giao-vien/de-thi", label: "Đề thi" },
    { href: "/giao-vien/so-hoa", label: "Số hóa đề" },
  ],
};

export function NavBar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV[user.role] ?? [];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/dang-nhap");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-700 text-sm text-white">T</span>
          ThiOnline
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-slate-600 sm:block">{user.name}</span>
          <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Đăng xuất
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 md:hidden">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1 text-sm ${active ? "bg-blue-50 text-blue-700" : "text-slate-600"}`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
