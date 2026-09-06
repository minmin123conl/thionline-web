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
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blu text-sm font-extrabold text-white">T</span>
          ThiOnline
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--dur-fast)] ${
                  active ? "bg-blu-soft text-blu" : "text-ink2 hover:bg-surface2 hover:text-ink"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm font-medium text-ink2 sm:block">{user.name}</span>
          <button onClick={logout} className="btn btn-ghost text-sm">
            Đăng xuất
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-1.5 md:hidden">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1 text-sm ${
                active ? "bg-blu-soft font-medium text-blu" : "text-ink2"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
