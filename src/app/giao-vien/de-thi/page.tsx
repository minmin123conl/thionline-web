import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, examTemplates, exams, questions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { CreateExamForm } from "@/components/CreateExamForm";
import { DeleteExamButton } from "@/components/DeleteExamButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đề thi — ThiOnline" };

export default async function TeacherExams() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const list =
    user.role === "ADMIN"
      ? await db.select().from(exams).orderBy(desc(exams.createdAt))
      : await db.select().from(exams).where(eq(exams.teacherId, user.id)).orderBy(desc(exams.createdAt));

  const [qCounts, aCounts, templates] = await Promise.all([
    db.select({ examId: questions.examId, n: count() }).from(questions).groupBy(questions.examId),
    db.select({ examId: assignments.examId, n: count() }).from(assignments).groupBy(assignments.examId),
    db.select().from(examTemplates),
  ]);
  const qMap = new Map(qCounts.map((r) => [r.examId, r.n]));
  const aMap = new Map(aCounts.map((r) => [r.examId, r.n]));
  const tplMap = new Map(templates.map((t) => [t.code, t]));

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Đề thi</h1>
          <LinkButton href="/giao-vien/so-hoa" variant="secondary">Số hóa đề từ file Word/PDF →</LinkButton>
        </div>

        <div className="mt-4">
          <CreateExamForm
            templates={templates.map((t) => ({
              code: t.code,
              name: t.name,
              totalMinutes: t.totalMinutes,
              description: t.description,
            }))}
          />
        </div>

        <div className="mt-6 space-y-3">
          {list.length === 0 ? (
            <EmptyState
              title="Chưa có đề nào"
              subtitle="Tạo đề trắng ở khung phía trên, hoặc upload file đề Word/PDF để AI đọc và chuyển thành câu hỏi có thể chỉnh sửa."
            />
          ) : (
            list.map((e) => {
              const tpl = e.templateCode ? tplMap.get(e.templateCode) : undefined;
              const canDelete = e.status === "DRAFT" && (aMap.get(e.id) ?? 0) === 0;
              return (
                <Card key={e.id} className="p-4 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link href={`/giao-vien/de-thi/${e.id}`} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{e.title}</p>
                        {e.status === "PUBLISHED" ? <Badge color="green">Đã phát hành</Badge> : <Badge color="amber">Nháp</Badge>}
                        {tpl && <Badge color="blue">{tpl.name}</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {qMap.get(e.id) ?? 0} câu hỏi
                        {tpl ? ` · ${tpl.totalMinutes} phút theo khuôn` : e.totalMinutes ? ` · ${e.totalMinutes} phút` : ""}
                        {` · ${aMap.get(e.id) ?? 0} lần giao`}
                        {` · ${e.createdAt.toLocaleDateString("vi-VN")}`}
                      </p>
                      <span className="mt-1 block text-xs text-blue-700">Mở đề →</span>
                    </Link>
                    {canDelete && <DeleteExamButton examId={e.id} title={e.title} />}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </main>
    </>
  );
}
