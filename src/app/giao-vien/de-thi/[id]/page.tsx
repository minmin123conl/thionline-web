import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, classRooms, examTemplates, exams, questions, sections } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { ExamBuilder, type Answer, type BQ, type BS } from "@/components/ExamBuilder";
import { parseSectionsSpec } from "@/lib/templates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Soạn đề — ThiOnline" };

export default async function TeacherExamDetail({ params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const rows = await db.select().from(exams).where(eq(exams.id, params.id));
  const exam = rows[0];
  if (!exam || (user.role !== "ADMIN" && exam.teacherId !== user.id)) notFound();

  const [secs, qs] = await Promise.all([
    db.select().from(sections).where(eq(sections.examId, exam.id)).orderBy(asc(sections.position)),
    db.select().from(questions).where(eq(questions.examId, exam.id)).orderBy(asc(questions.position)),
  ]);

  const initialSections: BS[] = secs.map((s, si) => ({
    key: `s-${si}`,
    id: s.id,
    code: s.code,
    title: s.title,
    minutes: s.minutes,
    questions: qs
      .filter((q) => q.sectionId === s.id)
      .sort((a, b) => a.position - b.position)
      .map((q, qi): BQ => ({
        key: `q-${si}-${qi}`,
        type: q.type as BQ["type"],
        stem: q.stem,
        options: (q.options as { id: string; text: string }[]) ?? [],
        answer: (q.answer as Answer) ?? null,
        explanation: q.explanation,
        points: q.points,
        isTrial: q.isTrial,
      })),
  }));

  const tplRows = exam.templateCode
    ? await db.select().from(examTemplates).where(eq(examTemplates.code, exam.templateCode))
    : [];
  const tpl = tplRows[0];

  const teacherId = user.role === "ADMIN" ? exam.teacherId : user.id;
  const classes = teacherId
    ? await db.select({ id: classRooms.id, name: classRooms.name }).from(classRooms).where(eq(classRooms.teacherId, teacherId)).orderBy(desc(classRooms.createdAt))
    : [];

  const asgRows = await db
    .select({ id: assignments.id, title: assignments.title, className: classRooms.name, createdAt: assignments.createdAt })
    .from(assignments)
    .innerJoin(classRooms, eq(classRooms.id, assignments.classId))
    .where(eq(assignments.examId, exam.id))
    .orderBy(desc(assignments.createdAt));

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link href="/giao-vien/de-thi" className="text-sm text-slate-500 hover:text-slate-800">← Danh sách đề</Link>
        <div className="mt-3">
          <ExamBuilder
            exam={{
              id: exam.id,
              title: exam.title,
              description: exam.description,
              status: exam.status,
              templateCode: exam.templateCode,
              totalMinutes: exam.totalMinutes,
              shuffleQuestions: exam.shuffleQuestions,
              shuffleOptions: exam.shuffleOptions,
              attemptsAllowed: exam.attemptsAllowed,
              revealResult: exam.revealResult,
            }}
            template={
              tpl
                ? { name: tpl.name, totalScore: tpl.totalScore, specs: parseSectionsSpec(JSON.stringify(tpl.sectionsSpec)) }
                : null
            }
            initialSections={initialSections}
            classes={classes}
            assignments={asgRows.map((a) => ({ id: a.id, title: a.title, className: a.className }))}
          />
        </div>
      </main>
    </>
  );
}
