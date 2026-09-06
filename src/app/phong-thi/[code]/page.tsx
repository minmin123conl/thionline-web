import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { examTemplates, exams, questions, sections } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { parseSectionsSpec } from "@/lib/templates";
import { StartMockButton } from "@/components/StartMockButton";

export const dynamic = "force-dynamic";

export default async function MockTemplatePage({ params }: { params: { code: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role !== "STUDENT") redirect("/");

  const tRows = await db.select().from(examTemplates).where(eq(examTemplates.code, params.code.toLowerCase()));
  const template = tRows[0];
  if (!template) notFound();

  const specs = parseSectionsSpec(JSON.stringify(template.sectionsSpec));
  const mockExams = await db
    .select()
    .from(exams)
    .where(and(eq(exams.templateCode, template.code), eq(exams.status, "PUBLISHED")))
    .orderBy(desc(exams.publishedAt));

  const examSections = new Map<string, { id: string; title: string; code: string; qCount: number }[]>();
  for (const e of mockExams) {
    const secs = await db.select().from(sections).where(eq(sections.examId, e.id));
    secs.sort((a, b) => a.position - b.position);
    const qCounts = await db
      .select({ sectionId: questions.sectionId, count: questions.id })
      .from(questions)
      .where(eq(questions.examId, e.id));
    const countMap = new Map<string, number>();
    for (const q of qCounts) countMap.set(q.sectionId, (countMap.get(q.sectionId) ?? 0) + 1);
    examSections.set(
      e.id,
      secs.map((s) => ({ id: s.id, title: s.title, code: s.code, qCount: countMap.get(s.id) ?? 0 }))
    );
  }

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/phong-thi" className="text-sm text-slate-500 hover:underline">← Tất cả kỳ thi</Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="mt-1 h-12 w-2 rounded-full" style={{ backgroundColor: template.brandColor }} />
          <div>
            <h1 className="text-2xl font-bold">{template.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{template.description}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge color="blue">{template.totalMinutes} phút</Badge>
              <Badge color="blue">{specs.reduce((a, s) => a + s.questions, 0)} câu</Badge>
              <Badge color="blue">Thang điểm {template.totalScore}</Badge>
              <Badge color={template.timingMode === "GLOBAL" ? "amber" : "slate"}>
                {template.timingMode === "GLOBAL" ? "Một đồng hồ chung" : "Đồng hồ riêng từng phần"}
              </Badge>
            </div>
          </div>
        </div>

        <h2 className="mb-2 mt-8 text-lg font-semibold">Cấu trúc bài thi</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Phần</th>
                <th className="px-4 py-2.5">Thời gian</th>
                <th className="px-4 py-2.5">Số câu</th>
                <th className="px-4 py-2.5">Điểm</th>
                <th className="px-4 py-2.5">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {specs.map((s) => (
                <tr key={s.code}>
                  <td className="px-4 py-2.5 font-medium">{s.title}</td>
                  <td className="px-4 py-2.5">{template.timingMode === "GLOBAL" ? `${s.minutes}' (khuyến nghị)` : `${s.minutes} phút`}</td>
                  <td className="px-4 py-2.5">{s.questions}</td>
                  <td className="px-4 py-2.5">{s.score}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {s.note ?? ""}
                    {s.trials ? ` Có thể kèm ${s.trials} câu thử nghiệm không tính điểm.` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <h2 className="mb-3 mt-8 text-lg font-semibold">Đề thi thử</h2>
        {mockExams.length === 0 ? (
          <EmptyState title="Chưa có đề cho kỳ thi này" subtitle="Giáo viên/trung tâm đang biên soạn đề — quay lại sau nhé." />
        ) : (
          <div className="space-y-4">
            {mockExams.map((e) => {
              const secs = examSections.get(e.id) ?? [];
              return (
                <Card key={e.id} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold">{e.title}</p>
                      {e.description && <p className="mt-0.5 text-sm text-slate-500">{e.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {secs.map((s) => (
                          <span key={s.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {s.title.split("—")[0].trim()}: {s.qCount} câu
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <StartMockButton
                        examId={e.id}
                        mode="MOCK_FULL"
                        label="Thi thử đầy đủ (bấm giờ)"
                        confirmMessage={
                          `Bạn sắp vào phòng thi mô phỏng:\n\n` +
                          `• ${template.totalMinutes} phút${template.timingMode === "PER_SECTION" ? ", đồng hồ riêng từng phần, hết giờ phần trước sẽ KHÔNG quay lại được" : ", một đồng hồ chung"}\n` +
                          `• Nên làm trên máy tính/tablet, chuẩn bị giấy nháp, phòng yên tĩnh\n` +
                          `• Đồng hồ vẫn chạy kể cả khi mất kết nối mạng\n\nBắt đầu ngay?`
                        }
                      />
                      {secs.map((s) => (
                        <StartMockButton
                          key={s.id}
                          examId={e.id}
                          mode="PRACTICE"
                          practiceSectionId={s.id}
                          label={`Luyện: ${s.title.replace(/^Phần \d+ — /, "")} (${s.qCount} câu)`}
                          variant="secondary"
                        />
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-xs text-slate-400">
          ThiOnline không liên kết với {template.org}. Cấu trúc mô phỏng theo thông tin công bố công khai năm {template.year}; điểm quy đổi hiển thị là ước lượng tham khảo.
        </p>
      </main>
    </>
  );
}
