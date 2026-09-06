import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, attempts, classRooms, documents, exams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Giáo viên — ThiOnline" };

export default async function TeacherHome() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const myClasses = await db.select().from(classRooms).where(eq(classRooms.teacherId, user.id));
  const myExams = await db.select().from(exams).where(eq(exams.teacherId, user.id)).orderBy(desc(exams.createdAt));
  const myAssignments = await db.select().from(assignments).where(eq(assignments.teacherId, user.id)).orderBy(desc(assignments.createdAt));
  const myDocs = await db
    .select({ id: documents.id, fileName: documents.fileName, status: documents.status })
    .from(documents)
    .where(eq(documents.teacherId, user.id))
    .orderBy(desc(documents.createdAt))
    .limit(5);

  let submissionCount = 0;
  if (myAssignments.length > 0) {
    const rows = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(attempts)
      .where(inArray(attempts.assignmentId, myAssignments.map((a) => a.id)));
    submissionCount = rows[0]?.count ?? 0;
  }

  const drafts = myExams.filter((e) => e.status === "DRAFT");
  const published = myExams.filter((e) => e.status === "PUBLISHED");
  const examById = new Map(myExams.map((e) => [e.id, e]));
  const classById = new Map(myClasses.map((c) => [c.id, c]));

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">Bảng điều khiển</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Lớp học", value: myClasses.length, href: "/giao-vien/lop" },
            { label: "Đề thi", value: myExams.length, href: "/giao-vien/de-thi" },
            { label: "Đã giao", value: myAssignments.length, href: "/giao-vien/de-thi" },
            { label: "Bài đã nộp", value: submissionCount, href: "/giao-vien/lop" },
          ].map((s) => (
            <Link key={s.label} href={s.href}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Đề nháp đang soạn</h2>
              <LinkButton href="/giao-vien/de-thi" variant="secondary">+ Đề mới</LinkButton>
            </div>
            {drafts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Không có đề nháp. Bắt đầu tạo đề mới hoặc số hóa từ file Word/PDF.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {drafts.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Link href={`/giao-vien/de-thi/${e.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-blue-700">
                      <span className="font-medium">{e.title}</span>
                      <Badge color="amber">Nháp</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/giao-vien/so-hoa" className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline">
              Số hóa đề từ file Word/PDF →
            </Link>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Đề đã phát hành</h2>
            {published.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Chưa có đề nào được phát hành.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {published.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Link href={`/giao-vien/de-thi/${e.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-blue-700">
                      <span className="font-medium">
                        {e.title}
                        {e.templateCode && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">{e.templateCode}</span>}
                      </span>
                      <Badge color="green">Đã phát hành</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <h2 className="mb-3 mt-8 text-lg font-semibold">Đã giao gần đây</h2>
        {myAssignments.length === 0 ? (
          <EmptyState title="Chưa giao đề nào" subtitle="Phát hành một đề rồi giao cho lớp để học sinh bắt đầu làm bài." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {myAssignments.slice(0, 6).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{a.title || examById.get(a.examId)?.title}</p>
                  <p className="text-xs text-slate-500">
                    Lớp {classById.get(a.classId)?.name ?? "—"} ·{" "}
                    {a.closesAt ? `Hạn nộp ${a.closesAt.toLocaleString("vi-VN")}` : "Không giới hạn thời gian nộp"}
                  </p>
                </div>
                <Link href={`/giao-vien/bao-cao/${a.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  Xem báo cáo →
                </Link>
              </div>
            ))}
          </Card>
        )}

        {myDocs.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-lg font-semibold">Tài liệu số hóa gần đây</h2>
            <Card className="divide-y divide-slate-100">
              {myDocs.map((d) => (
                <Link key={d.id} href={`/giao-vien/so-hoa/${d.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50">
                  <span className="font-medium">{d.fileName}</span>
                  <Badge color={d.status === "NEEDS_REVIEW" ? "amber" : d.status === "IMPORTED" ? "green" : d.status === "FAILED" ? "red" : "slate"}>
                    {d.status === "NEEDS_REVIEW" ? "Chờ duyệt" : d.status === "IMPORTED" ? "Đã nhập" : d.status === "FAILED" ? "Lỗi" : d.status === "PROCESSING" ? "Đang xử lý" : "Đã tải lên"}
                  </Badge>
                </Link>
              ))}
            </Card>
          </>
        )}
      </main>
    </>
  );
}
