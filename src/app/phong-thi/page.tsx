import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { examTemplates, exams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Card, EmptyState } from "@/components/ui";
import { parseSectionsSpec } from "@/lib/templates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Phòng thi thực chiến — ThiOnline" };

export default async function MockRoom() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role !== "STUDENT") redirect("/");

  const templates = await db.select().from(examTemplates);
  const counts = await db
    .select({ templateCode: exams.templateCode, count: sql<number>`COUNT(*)::int` })
    .from(exams)
    .where(eq(exams.status, "PUBLISHED"))
    .groupBy(exams.templateCode);
  const countByCode = new Map(counts.map((c) => [c.templateCode, c.count]));

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold">Phòng thi thực chiến</h1>
        <p className="mt-1 text-sm text-slate-500">
          Thi thử mô phỏng đúng cấu trúc, thời lượng và quy chế bấm giờ từng phần của các kỳ thi đánh giá năng lực / tư duy — cấu trúc theo công bố năm {templates[0]?.year ?? 2026}.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {templates.map((t) => {
            const specs = parseSectionsSpec(JSON.stringify(t.sectionsSpec));
            const n = countByCode.get(t.code) ?? 0;
            return (
              <Link key={t.code} href={`/phong-thi/${t.code}`}>
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="h-2" style={{ backgroundColor: t.brandColor }} />
                  <div className="p-4">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
                      style={{ backgroundColor: t.brandColor }}
                    >
                      {t.code.replace(/^./, (c) => c.toUpperCase())}
                    </span>
                    <h2 className="mt-2 font-semibold leading-snug">{t.org}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {t.totalMinutes} phút · {specs.reduce((a, s) => a + s.questions, 0)} câu ·{" "}
                      {t.timingMode === "GLOBAL" ? "1 đồng hồ chung, tự phân bổ" : "đồng hồ riêng từng phần"}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-400">{specs.length} phần thi</span>
                      <span className={n > 0 ? "font-medium text-emerald-700" : "text-slate-400"}>
                        {n > 0 ? `${n} đề sẵn sàng` : "Chưa có đề"}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {templates.length === 0 && <EmptyState title="Chưa có kỳ thi nào" />}

        <Card className="mt-6 border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
          <p className="font-semibold">Hai chế độ luyện tập</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-blue-800">
            <li><b>Thi thử đầy đủ</b>: giữ nguyên áp lực thời gian như thi thật, khóa phần khi hết giờ, điểm quy đổi ước lượng theo thang kỳ thi.</li>
            <li><b>Luyện từng phần</b>: không giới hạn thời gian, tập trung một phần bạn muốn cải thiện, xem giải thích ngay sau khi nộp.</li>
          </ul>
        </Card>
      </main>
    </>
  );
}
