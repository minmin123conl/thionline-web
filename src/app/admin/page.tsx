import { redirect } from "next/navigation";
import { count, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, classRooms, documents, examTemplates, exams, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Badge, Card } from "@/components/ui";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Quản trị — ThiOnline" };


export default async function AdminPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role !== "ADMIN") redirect(user.role === "TEACHER" ? "/giao-vien" : "/hoc-sinh");

  const [roleStats, classCount, examStats, attemptStats, docCount, templates, userRows] = await Promise.all([
    db.select({ role: users.role, n: count() }).from(users).groupBy(users.role),
    db.select({ n: count() }).from(classRooms),
    db.select({ status: exams.status, n: count() }).from(exams).groupBy(exams.status),
    db.select({ status: attempts.status, n: count() }).from(attempts).groupBy(attempts.status),
    db.select({ n: count() }).from(documents),
    db.select().from(examTemplates),
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(200),
  ]);

  const byRole = Object.fromEntries(roleStats.map((r) => [r.role, r.n]));
  const byExamStatus = Object.fromEntries(examStats.map((r) => [r.status, r.n]));
  const byAttemptStatus = Object.fromEntries(attemptStats.map((r) => [r.status, r.n]));
  const attemptsDone = (byAttemptStatus["SUBMITTED"] ?? 0) + (byAttemptStatus["AUTO_SUBMITTED"] ?? 0);

  const cards = [
    { label: "Giáo viên", value: byRole["TEACHER"] ?? 0 },
    { label: "Học sinh", value: byRole["STUDENT"] ?? 0 },
    { label: "Lớp học", value: classCount[0]?.n ?? 0 },
    { label: "Đề đã phát hành", value: byExamStatus["PUBLISHED"] ?? 0 },
    { label: "Đề nháp", value: byExamStatus["DRAFT"] ?? 0 },
    { label: "Lượt làm bài", value: attemptsDone },
    { label: "Đang làm dở", value: byAttemptStatus["ACTIVE"] ?? 0 },
    { label: "Tài liệu số hóa", value: docCount[0]?.n ?? 0 },
  ];

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">Quản trị hệ thống</h1>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className="p-4">
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className="mt-1 text-2xl font-bold">{c.value}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-6 p-4">
          <p className="text-sm text-ink2">
            Quản lý tài khoản ở bảng phía dưới: tạo mới (giáo viên / học sinh / quản trị), đổi vai trò, xóa tài khoản.
            Học sinh cũng có thể tự đăng ký.
          </p>
        </Card>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Khuôn kỳ thi thực chiến</h2>
          <p className="mt-1 text-sm text-slate-500">
            Thêm khuôn mới bằng cách chạy script seed (không cần sửa code ứng dụng).
          </p>
          <Card className="mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Kỳ thi</th>
                  <th className="px-4 py-2 font-medium">Đơn vị</th>
                  <th className="px-4 py-2 font-medium">Thời gian</th>
                  <th className="px-4 py-2 font-medium">Thang điểm</th>
                  <th className="px-4 py-2 font-medium">Đồng hồ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium" style={{ color: t.brandColor }}>{t.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{t.code} · {t.year}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{t.org}</td>
                    <td className="px-4 py-2.5 text-slate-600">{t.totalMinutes} phút</td>
                    <td className="px-4 py-2.5 text-slate-600">{t.totalScore}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={t.timingMode === "GLOBAL" ? "blue" : "slate"}>
                        {t.timingMode === "GLOBAL" ? "Một đồng hồ chung" : "Mỗi phần một đồng hồ"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <AdminUsersPanel
          meId={user.id}
          initialUsers={userRows.map((u) => ({ ...u, role: u.role as "ADMIN" | "TEACHER" | "STUDENT", createdAt: u.createdAt.toISOString() }))}
        />
      </main>
    </>
  );
}
