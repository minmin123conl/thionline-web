import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { buildResult, canRevealResult, finalizeIfExpired, getAttempt } from "@/lib/attempt";
import { NavBar } from "@/components/NavBar";
import { Badge, Card } from "@/components/ui";
import { ResultReview } from "@/components/ResultReview";

export const dynamic = "force-dynamic";

export const metadata = { title: "Kết quả — ThiOnline" };

export default async function ResultPage({ params }: { params: { attemptId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }

  const attempt = await getAttempt(params.attemptId);
  if (!attempt) redirect("/hoc-sinh");
  if (user.role === "STUDENT" && attempt.studentId !== user.id) redirect("/hoc-sinh");

  let studentName = user.name;
  if (user.role !== "STUDENT") {
    const sRows = await db.select({ name: users.name }).from(users).where(eq(users.id, attempt.studentId));
    studentName = sRows[0]?.name ?? "Học sinh";
  }

  if (attempt.status === "ACTIVE") {
    await finalizeIfExpired(attempt);
    const fresh = await getAttempt(params.attemptId);
    if (fresh?.status === "ACTIVE") {
      return (
        <>
          <NavBar user={user} />
          <main className="mx-auto max-w-3xl px-4 py-10 text-center">
            <p className="font-semibold">Bài thi đang diễn ra, chưa có kết quả.</p>
            <Link href={`/thi/${params.attemptId}`} className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline">
              Quay lại phòng thi →
            </Link>
          </main>
        </>
      );
    }
  }

  const reveal = await canRevealResult(params.attemptId, user);
  if (!reveal.allowed) {
    return (
      <>
        <NavBar user={user} />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <Card className="p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">🔒</div>
            <h1 className="mt-4 text-lg font-bold">Kết quả chưa được mở</h1>
            <p className="mt-2 text-sm text-slate-600">{reveal.reason}</p>
            <p className="mt-4 text-2xl font-bold text-slate-800">
              {attempt.score ?? "—"}
              {attempt.maxScore ? <span className="text-base font-medium text-slate-400">/{attempt.maxScore} điểm</span> : null}
            </p>
            <p className="mt-1 text-xs text-slate-400">Chi tiết câu hỏi sẽ hiện khi kết quả được mở.</p>
          </Card>
        </main>
      </>
    );
  }

  const r = await buildResult(params.attemptId);
  const pct = r.attempt.maxScore ? Math.round(((r.attempt.score ?? 0) / r.attempt.maxScore) * 100) : 0;
  const sectionList = Object.values(r.sectionScores);
  const ranked = [...sectionList].filter((s) => s.max > 0).sort((a, b) => b.score / b.max - a.score / a.max);
  const strong = ranked[0];
  const weak = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{r.exam.title}</h1>
          {r.attempt.mode === "MOCK_FULL" && <Badge color="blue">Thi thử đầy đủ</Badge>}
          {r.attempt.mode === "PRACTICE" && <Badge color="green">Luyện tập</Badge>}
          {r.attempt.status === "AUTO_SUBMITTED" && <Badge color="amber">Tự động nộp khi hết giờ</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {studentName} · Nộp lúc {r.attempt.submittedAt?.toLocaleString("vi-VN")}
          {r.totalTimeMs ? ` · Tổng thời gian ${Math.floor(r.totalTimeMs / 60000)} phút` : ""}
        </p>

        <Card className="mt-5 p-6 text-center">
          <p className="text-sm text-slate-500">Điểm của bạn</p>
          <p className="mt-1 text-5xl font-extrabold text-slate-900">
            {r.attempt.score ?? 0}
            <span className="text-2xl font-medium text-slate-400">/{r.attempt.maxScore ?? 0}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">{pct}% câu đúng ({r.perQuestion.filter((q) => q.correct).length}/{r.perQuestion.length})</p>
          {r.template && r.convertedEstimate !== null && (
            <div className="mx-auto mt-4 max-w-sm rounded-xl bg-indigo-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">Điểm quy đổi ước lượng · thang {r.template.totalScore}</p>
              <p className="text-3xl font-extrabold text-indigo-700">≈ {r.convertedEstimate}</p>
              <p className="mt-1 text-[11px] leading-snug text-indigo-400">
                Ước lượng tham khảo theo tỷ lệ điểm thô — thang điểm chính thức của kỳ thi được chấm theo phương pháp chuẩn hóa/IRT trên đề gốc, không thể tái tạo chính xác bên ngoài hệ thống của ban tổ chức.
              </p>
            </div>
          )}
        </Card>

        {sectionList.length > 1 && (
          <Card className="mt-4 p-5">
            <h2 className="mb-3 font-semibold">Điểm theo từng phần</h2>
            <div className="space-y-3">
              {sectionList.map((s) => {
                const p = s.max > 0 ? Math.round((s.score / s.max) * 100) : 0;
                return (
                  <div key={s.title}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{s.title}</span>
                      <span className="text-slate-500">
                        {s.score}/{s.max} điểm · {s.correct}/{s.total} câu đúng
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${p >= 75 ? "bg-emerald-500" : p >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                        style={{ width: `${p}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {(strong || weak) && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {strong && (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    💪 <b>Điểm mạnh:</b> {strong.title} ({Math.round((strong.score / strong.max) * 100)}%)
                  </p>
                )}
                {weak && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    📈 <b>Cần cải thiện:</b> {weak.title} ({Math.round((weak.score / weak.max) * 100)}%) — thử chế độ Luyện từng phần
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        <div className="mt-6">
          <ResultReview questions={r.perQuestion} />
        </div>

        <div className="mt-8 flex gap-3">
          <Link href={r.attempt.mode === "EXAM" ? "/hoc-sinh" : "/phong-thi"} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ← Quay lại
          </Link>
          {r.exam.templateCode && (
            <Link href={`/phong-thi/${r.exam.templateCode}`} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800">
              Luyện tiếp kỳ thi này
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
