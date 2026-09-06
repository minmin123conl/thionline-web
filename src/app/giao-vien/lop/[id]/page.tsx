import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, classMembers, classRooms, exams, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { BulkStudentsForm } from "@/components/BulkStudentsForm";
import { CopyCode } from "@/components/CopyCode";

export const dynamic = "force-dynamic";

export const metadata = { title: "Chi tiết lớp — ThiOnline" };

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export default async function TeacherClassDetail({ params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const rows = await db.select().from(classRooms).where(eq(classRooms.id, params.id));
  const klass = rows[0];
  if (!klass || (user.role !== "ADMIN" && klass.teacherId !== user.id)) notFound();

  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, joinedAt: classMembers.joinedAt })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.userId))
    .where(eq(classMembers.classId, klass.id))
    .orderBy(desc(classMembers.joinedAt));

  const asgs = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      opensAt: assignments.opensAt,
      closesAt: assignments.closesAt,
      createdAt: assignments.createdAt,
      examId: exams.id,
      examTitle: exams.title,
    })
    .from(assignments)
    .innerJoin(exams, eq(exams.id, assignments.examId))
    .where(eq(assignments.classId, klass.id))
    .orderBy(desc(assignments.createdAt));

  const now = new Date();

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/giao-vien/lop" className="text-sm text-slate-500 hover:text-slate-800">← Danh sách lớp</Link>

        <Card className="mt-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{klass.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{members.length} học sinh</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Mã tham gia lớp</p>
              <CopyCode code={klass.joinCode} />
              <p className="mt-1 text-xs text-slate-500">Học sinh vào &quot;Lớp học&quot; → nhập mã này để tham gia.</p>
            </div>
          </div>
          {user.role !== "ADMIN" && <div className="mt-4"><BulkStudentsForm classId={klass.id} /></div>}
        </Card>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Đã giao cho lớp</h2>
            <LinkButton href="/giao-vien/de-thi" variant="secondary">Chọn đề để giao →</LinkButton>
          </div>
          <div className="mt-3 space-y-2">
            {asgs.length === 0 ? (
              <EmptyState title="Chưa giao đề nào" subtitle="Mở một đề thi ở khu Đề thi, chọn “Giao đề” rồi chọn lớp này." />
            ) : (
              asgs.map((a) => (
                <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.title || a.examTitle}</p>
                    <p className="text-xs text-slate-500">
                      Đề gốc: {a.examTitle} · Mở {fmt(a.opensAt)} · Hạn {fmt(a.closesAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.closesAt && a.closesAt < now ? <Badge color="slate">Đã đóng</Badge> : <Badge color="green">Đang mở</Badge>}
                    <LinkButton href={`/giao-vien/bao-cao/${a.id}`} variant="ghost">Xem báo cáo →</LinkButton>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Học sinh trong lớp</h2>
          <Card className="mt-3 overflow-hidden">
            {members.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">
                Chưa có học sinh. Học sinh có thể tự tham gia bằng mã lớp, hoặc bạn tạo hàng loạt tài khoản ở khung phía trên.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Họ tên</th>
                    <th className="px-4 py-2 font-medium">Tên đăng nhập</th>
                    <th className="px-4 py-2 font-medium">Tham gia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{m.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{m.email.split("@")[0]}</td>
                      <td className="px-4 py-2.5 text-slate-500">{fmt(m.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      </main>
    </>
  );
}
