"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, Input } from "./ui";
import { CopyCode } from "./CopyCode";

export type ClassRow = {
  id: string;
  name: string;
  joinCode: string;
  memberCount: number;
  createdAt: string;
  assignments: {
    id: string;
    title: string;
    opensAt: string | null;
    closesAt: string | null;
  }[];
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

const PAGE_SIZE = 10;

export function ClassesTable({ initialClasses }: { initialClasses: ClassRow[] }) {
  const router = useRouter();
  const [classes, setClasses] = useState(initialClasses);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter((c) => c.name.toLowerCase().includes(q) || c.joinCode.toLowerCase().includes(q));
  }, [classes, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const now = Date.now();

  function onCreated(cls: { id: string; name: string; joinCode: string; createdAt: string }) {
    setClasses((prev) => [{ ...cls, memberCount: 0, assignments: [] }, ...prev]);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên lớp hoặc mã mời..."
          />
        </div>
        <Button onClick={() => setShowModal(true)}>+ Tạo lớp mới</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={query ? "Không tìm thấy lớp nào" : "Chưa có lớp nào"}
            subtitle={query ? "Thử từ khóa khác." : "Tạo lớp đầu tiên, sau đó gửi mã mời cho học sinh."}
            action={!query ? <Button onClick={() => setShowModal(true)}>+ Tạo lớp mới</Button> : undefined}
          />
        </div>
      ) : (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tên lớp</th>
                <th className="px-4 py-3 font-medium">Mã mời</th>
                <th className="px-4 py-3 font-medium text-right">Học sinh</th>
                <th className="px-4 py-3 font-medium">Đề đã giao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((c) => (
                <tr key={c.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/giao-vien/lop/${c.id}`} className="font-semibold text-slate-800 hover:text-blue-700 hover:underline">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">Tạo {new Date(c.createdAt).toLocaleDateString("vi-VN")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <CopyCode code={c.joinCode} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{c.memberCount}</td>
                  <td className="px-4 py-3">
                    {c.assignments.length === 0 ? (
                      <span className="text-xs text-slate-400">Chưa giao đề nào</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {c.assignments.slice(0, 3).map((a) => {
                          const closed = a.closesAt && new Date(a.closesAt).getTime() < now;
                          return (
                            <li key={a.id} className="flex flex-wrap items-center gap-2">
                              <span className="max-w-[260px] truncate text-slate-700">{a.title}</span>
                              {closed ? <Badge color="slate">Đã đóng</Badge> : <Badge color="green">Đang mở</Badge>}
                              <span className="text-xs text-slate-400">
                                {fmt(a.opensAt)} → {fmt(a.closesAt)}
                              </span>
                            </li>
                          );
                        })}
                        {c.assignments.length > 3 && (
                          <li className="text-xs text-slate-400">
                            + {c.assignments.length - 3} đề khác — <Link href={`/giao-vien/lop/${c.id}`} className="text-blue-700 hover:underline">xem tất cả</Link>
                          </li>
                        )}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <p className="text-xs text-slate-500">
                {filtered.length} lớp · trang {current}/{totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>← Trước</Button>
                <Button variant="secondary" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Sau →</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {showModal && <CreateClassModal onClose={() => setShowModal(false)} onCreated={onCreated} />}
    </div>
  );
}

function CreateClassModal({ onClose, onCreated }: { onClose: () => void; onCreated: (cls: { id: string; name: string; joinCode: string; createdAt: string }) => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; name: string; joinCode: string; createdAt: string } | null>(null);

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
    setCreated(data.classRoom);
    onCreated(data.classRoom);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={created ? onClose : undefined}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {created ? (
          <>
            <h3 className="text-lg font-bold">Đã tạo lớp {created.name}</h3>
            <p className="mt-3 text-sm text-slate-600">Mã mời cho học sinh:</p>
            <div className="mt-2 flex justify-center">
              <CopyCode code={created.joinCode} label="Nhấn để sao chép" />
            </div>
            <p className="mt-3 text-xs text-slate-500">Gửi mã này cho học sinh — họ vào &quot;Lớp học&quot; rồi nhập mã để tham gia.</p>
            <div className="mt-5 flex justify-end">
              <Button onClick={onClose}>Xong</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold">Tạo lớp mới</h3>
            <form onSubmit={submit} className="mt-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Tên lớp</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Toán 12A1 — Ca tối 3-5" required minLength={2} autoFocus />
              </label>
              {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>Hủy</Button>
                <Button type="submit" disabled={loading || name.trim().length < 2}>
                  {loading ? "Đang tạo..." : "Tạo lớp"}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
