import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, attemptAnswers, attempts, classMembers, classRooms, exams, questions, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { scoreQuestion } from "@/lib/exam-utils";
import { NavBar } from "@/components/NavBar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { TeX } from "@/components/Tex";

export const dynamic = "force-dynamic";

export const metadata = { title: "Báo cáo — ThiOnline" };

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export default async function AssignmentReport({ params }: { params: { assignmentId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const asgRows = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      opensAt: assignments.opensAt,
      closesAt: assignments.closesAt,
      attemptsAllowed: assignments.attemptsAllowed,
      revealResult: assignments.revealResult,
      classId: assignments.classId,
      className: classRooms.name,
      teacherId: classRooms.teacherId,
      examId: exams.id,
      examTitle: exams.title,
      examMax: exams.totalMinutes,
    })
    .from(assignments)
    .innerJoin(classRooms, eq(classRooms.id, assignments.classId))
    .innerJoin(exams, eq(exams.id, assignments.examId))
    .where(eq(assignments.id, params.assignmentId));
  const asg = asgRows[0];
  if (!asg || (user.role !== "ADMIN" && asg.teacherId !== user.id)) notFound();

  const [memberRows, attemptRows, examQuestions] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.userId))
      .where(eq(classMembers.classId, asg.classId)),
    db
      .select()
      .from(attempts)
      .where(eq(attempts.assignmentId, asg.id))
      .orderBy(desc(attempts.startedAt)),
    db.select().from(questions).where(eq(questions.examId, asg.examId)),
  ]);

  const submitted = attemptRows.filter((a) => a.status !== "ACTIVE");
  const submittedIds = submitted.map((a) => a.id);
  const answers =
    submittedIds.length > 0
      ? await db.select().from(attemptAnswers).where(inArray(attemptAnswers.attemptId, submittedIds))
      : [];

  const answersByAttempt = new Map<string, typeof answers>();
  for (const a of answers) {
    const list = answersByAttempt.get(a.attemptId);
    if (list) list.push(a);
    else answersByAttempt.set(a.attemptId, [a]);
  }

  const qById = new Map(examQuestions.map((q) => [q.id, q]));
  const scoredQuestions = examQuestions.filter((q) => !q.isTrial);

  // thống kê từng câu: bao nhiêu lượt trả lời, bao nhiêu đúng
  const qStats = new Map<string, { answered: number; correct: number; earned: number; possible: number }>();
  for (const q of scoredQuestions) qStats.set(q.id, { answered: 0, correct: 0, earned: 0, possible: 0 });

  for (const a of submitted) {
    const list = answersByAttempt.get(a.id) ?? [];
    for (const ans of list) {
      const q = qById.get(ans.questionId);
      if (!q || q.isTrial) continue;
      const st = qStats.get(q.id);
      if (!st) continue;
      if (ans.answer == null) continue;
      st.answered += 1;
      const earned = scoreQuestion(q.type, JSON.stringify(q.answer ?? null), JSON.stringify(ans.answer), q.points);
      st.earned += earned;
      st.possible += q.points;
      if (earned >= q.points - 1e-9) st.correct += 1;
    }
  }

  const hardest = scoredQuestions
    .map((q) => ({ q, st: qStats.get(q.id)! }))
    .filter((r) => r.st.answered > 0)
    .map((r) => ({ ...r, rate: r.st.correct / r.st.answered }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 12);

  const bestByStudent = new Map<string, { score: number; max: number; attempts: number; lastAt: Date | null; active: boolean }>();
  for (const m of memberRows) bestByStudent.set(m.id, { score: 0, max: 0, attempts: 0, lastAt: null, active: false });
  for (const a of attemptRows) {
    const row = bestByStudent.get(a.studentId);
    if (!row) continue;
    row.attempts += 1;
    if (a.status === "ACTIVE") row.active = true;
    if (a.status !== "ACTIVE" && (a.score ?? 0) > row.score) {
      row.score = a.score ?? 0;
      row.max = a.maxScore ?? 0;
      row.lastAt = a.submittedAt;
    }
  }

  const rows = memberRows
    .map((m) => ({ ...m, ...(bestByStudent.get(m.id) ?? { score: 0, max: 0, attempts: 0, lastAt: null, active: false }) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "vi"));

  const done = rows.filter((r) => r.attempts > 0 && !r.active);
  const scores = done.map((r) => (r.max > 0 ? (r.score / r.max) * 100 : 0));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const minScore = scores.length ? Math.min(...scores) : 0;
  const notStarted = rows.filter((r) => r.attempts === 0);
  const inProgress = rows.filter((r) => r.active);

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/giao-vien/de-thi/${asg.examId}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← Đề {asg.examTitle}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{asg.title || asg.examTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lớp {asg.className} · {rows.length} học sinh · Mở {fmt(asg.opensAt)} · Hạn {fmt(asg.closesAt)} ·{" "}
          {asg.attemptsAllowed} lượt làm ·{" "}
          {asg.revealResult === "IMMEDIATE"
            ? "hiện kết quả ngay"
            : asg.revealResult === "AFTER_CLOSE"
              ? "hiện kết quả sau hạn"
              : "chưa hiện kết quả"}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Đã nộp", value: `${done.length}/${rows.length}`, tone: "text-slate-900" },
            { label: "Điểm trung bình", value: `${avg.toFixed(1)}%`, tone: avg >= 50 ? "text-emerald-700" : "text-amber-700" },
            { label: "Cao nhất", value: `${maxScore.toFixed(0)}%`, tone: "text-slate-900" },
            { label: "Thấp nhất", value: `${minScore.toFixed(0)}%`, tone: "text-slate-900" },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.tone}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        {(inProgress.length > 0 || notStarted.length > 0) && (
          <p className="mt-3 text-sm text-slate-500">
            {inProgress.length > 0 && `${inProgress.length} em đang làm dở · `}
            {notStarted.length > 0 && `${notStarted.length} em chưa vào đề`}
          </p>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Kết quả theo học sinh</h2>
          <Card className="mt-3 overflow-hidden">
            {rows.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Lớp chưa có học sinh.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Học sinh</th>
                    <th className="px-4 py-2 font-medium">Lượt</th>
                    <th className="px-4 py-2 font-medium">Điểm cao nhất</th>
                    <th className="px-4 py-2 font-medium">Nộp lúc</th>
                    <th className="px-4 py-2 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const pct = r.max > 0 ? (r.score / r.max) * 100 : 0;
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-800">{r.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{r.email.split("@")[0]}</p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{r.attempts}</td>
                        <td className="px-4 py-2.5">
                          {r.attempts === 0 || r.max === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span>
                              <b>{r.score.toFixed(2)}</b>
                              <span className="text-slate-400">/{r.max}</span>
                              <span className={`ml-2 text-xs ${pct >= 50 ? "text-emerald-700" : "text-rose-600"}`}>
                                {pct.toFixed(0)}%
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{fmt(r.lastAt)}</td>
                        <td className="px-4 py-2.5">
                          {r.active ? (
                            <Badge color="blue">Đang làm</Badge>
                          ) : r.attempts === 0 ? (
                            <Badge color="slate">Chưa vào</Badge>
                          ) : (
                            <Badge color="green">Đã nộp</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Câu nhiều học sinh làm sai nhất</h2>
          {hardest.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Chưa có dữ liệu" subtitle="Thống kê hiện sau khi có học sinh nộp bài." />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {hardest.map(({ q, st, rate }) => (
                <Card key={q.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <Badge color={rate < 0.3 ? "red" : rate < 0.6 ? "amber" : "green"}>
                      {Math.round(rate * 100)}% đúng
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {st.correct}/{st.answered} lượt · {q.type === "MC4" ? "4 lựa chọn" : q.type === "FILL" ? "Điền" : "Đúng/Sai"}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-slate-700">
                    <TeX text={q.stem} />
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
