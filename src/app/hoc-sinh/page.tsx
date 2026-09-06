import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, attempts, classMembers, classRooms, exams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { sweepExpiredAttempts } from "@/lib/attempt";
import { NavBar } from "@/components/NavBar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { StartAssignmentButton } from "@/components/StartAssignmentButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trang chủ — ThiOnline" };

function fmtDate(d: Date | null) {
  return d ? d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : null;
}

export default async function StudentHome() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role !== "STUDENT") redirect("/");
  await sweepExpiredAttempts(user.id);

  const membershipRows = await db
    .select({ classId: classMembers.classId, className: classRooms.name })
    .from(classMembers)
    .innerJoin(classRooms, eq(classRooms.id, classMembers.classId))
    .where(eq(classMembers.userId, user.id));
  const classIds = membershipRows.map((m) => m.classId);

  let assignmentRows: (typeof assignments.$inferSelect & { examTitle: string; examId2?: string })[] = [];
  if (classIds.length > 0) {
    assignmentRows = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        opensAt: assignments.opensAt,
        closesAt: assignments.closesAt,
        attemptsAllowed: assignments.attemptsAllowed,
        revealResult: assignments.revealResult,
        classId: assignments.classId,
        examId: assignments.examId,
        examTitle: exams.title,
      })
      .from(assignments)
      .innerJoin(exams, eq(exams.id, assignments.examId))
      .where(and(inArray(assignments.classId, classIds), eq(exams.status, "PUBLISHED")))
      .orderBy(desc(assignments.createdAt)) as never;
  }

  const myAttempts = await db
    .select()
    .from(attempts)
    .where(eq(attempts.studentId, user.id))
    .orderBy(desc(attempts.startedAt));
  const attemptsByAssignment = new Map<string, typeof myAttempts>();
  for (const a of myAttempts) {
    if (!a.assignmentId) continue;
    if (!attemptsByAssignment.has(a.assignmentId)) attemptsByAssignment.set(a.assignmentId, []);
    attemptsByAssignment.get(a.assignmentId)!.push(a);
  }

  const recentResults = myAttempts.filter((a) => a.status !== "ACTIVE").slice(0, 5);
  const examTitles = new Map<string, string>();
  if (recentResults.length > 0) {
    const ex = await db.select({ id: exams.id, title: exams.title }).from(exams).where(inArray(exams.id, recentResults.map((r) => r.examId)));
    for (const e of ex) examTitles.set(e.id, e.title);
  }
  const now = new Date();

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold">Xin chào, {user.name} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          {membershipRows.length > 0
            ? `Bạn đang ở ${membershipRows.length} lớp: ${membershipRows.map((m) => m.className).join(", ")}`
            : "Bạn chưa tham gia lớp nào — vào Lớp của tôi để nhập mã lớp từ giáo viên."}
        </p>

        <Link
          href="/phong-thi"
          className="mt-6 block rounded-2xl bg-gradient-to-r from-indigo-700 via-blue-700 to-sky-600 p-6 text-white shadow-md transition-transform hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Luyện thi đánh giá năng lực</p>
              <h2 className="mt-1 text-xl font-bold">Phòng thi thực chiến</h2>
              <p className="mt-1 text-sm text-blue-100">Thi thử HSA · TSA · V-ACT đúng cấu trúc, bấm giờ như thi thật</p>
            </div>
            <span className="hidden rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold sm:block">Vào phòng →</span>
          </div>
        </Link>

        <h2 className="mb-3 mt-8 text-lg font-semibold">Đề được giao</h2>
        {assignmentRows.length === 0 ? (
          <EmptyState
            title="Chưa có đề nào được giao"
            subtitle="Khi giáo viên giao đề cho lớp của bạn, đề sẽ xuất hiện tại đây."
            action={membershipRows.length === 0 ? <Link href="/hoc-sinh/lop" className="text-sm font-medium text-blue-700 hover:underline">Nhập mã lớp →</Link> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {assignmentRows.map((a) => {
              const mine = attemptsByAssignment.get(a.id) ?? [];
              const active = mine.find((m) => m.status === "ACTIVE");
              const submitted = mine.filter((m) => m.status !== "ACTIVE");
              const best = submitted.length ? Math.max(...submitted.map((s) => s.score ?? 0)) : null;
              const notOpened = a.opensAt && now < a.opensAt;
              const closed = a.closesAt && now > a.closesAt;
              const className = membershipRows.find((m) => m.classId === a.classId)?.className ?? "";
              return (
                <Card key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{a.title || a.examTitle}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Lớp {className}
                      {a.opensAt && ` · Mở lúc ${fmtDate(a.opensAt)}`}
                      {a.closesAt && ` · Hạn nộp ${fmtDate(a.closesAt)}`}
                      {` · ${mine.length}/${a.attemptsAllowed} lượt`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {notOpened && <Badge color="amber">Chưa mở</Badge>}
                      {closed && <Badge color="slate">Đã đóng</Badge>}
                      {active && <Badge color="blue">Đang làm dở</Badge>}
                      {best !== null && (
                        <Badge color="green">
                          Điểm cao nhất: {best}
                          {submitted[0]?.maxScore ? `/${submitted[0].maxScore}` : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {submitted.length > 0 && (
                      <Link
                        href={`/ket-qua/${submitted[0].id}`}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        Xem kết quả
                      </Link>
                    )}
                    {!closed && (active || mine.length < a.attemptsAllowed) && (
                      <StartAssignmentButton
                        assignmentId={a.id}
                        label={active ? "Tiếp tục làm bài" : notOpened ? "Chưa đến giờ" : "Vào làm bài"}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {recentResults.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-lg font-semibold">Kết quả gần đây</h2>
            <Card className="divide-y divide-slate-100">
              {recentResults.map((r) => (
                <Link key={r.id} href={`/ket-qua/${r.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium">{examTitles.get(r.examId) ?? "Bài thi"}</p>
                    <p className="text-xs text-slate-500">{r.submittedAt?.toLocaleString("vi-VN")} · {r.status === "AUTO_SUBMITTED" ? "Tự động nộp" : "Đã nộp"}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">
                    {r.score ?? "—"}{r.maxScore ? `/${r.maxScore}` : ""}
                  </span>
                </Link>
              ))}
            </Card>
          </>
        )}
      </main>
    </>
  );
}
