import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { examTemplates, exams, questions, sections } from "@/lib/db/schema";
import { canManageExam, requireUser } from "@/lib/auth";
import { validateForPublish, type SectionDraft } from "@/lib/exam-validation";
import { parseSectionsSpec } from "@/lib/templates";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const examRows = await db.select().from(exams).where(eq(exams.id, params.id));
  const exam = examRows[0];
  if (!exam) return NextResponse.json({ error: "Không tìm thấy đề" }, { status: 404 });
  if (!(await canManageExam(user, exam))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (exam.status === "PUBLISHED") return NextResponse.json({ ok: true, already: true });

  const secs = await db.select().from(sections).where(eq(sections.examId, exam.id)).orderBy(asc(sections.position));
  const qs = await db.select().from(questions).where(eq(questions.examId, exam.id)).orderBy(asc(questions.position));

  const draftSections: SectionDraft[] = secs.map((s) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    minutes: s.minutes,
    questions: qs
      .filter((q) => q.sectionId === s.id)
      .map((q) => ({
        type: q.type,
        stem: q.stem,
        options: q.options as { id: string; text: string }[],
        answer: q.answer,
        explanation: q.explanation,
        points: q.points,
        isTrial: q.isTrial,
      })),
  }));

  let specs;
  if (exam.templateCode) {
    const tRows = await db.select().from(examTemplates).where(eq(examTemplates.code, exam.templateCode));
    specs = tRows[0] ? parseSectionsSpec(JSON.stringify(tRows[0].sectionsSpec)) : undefined;
  }

  const issues = validateForPublish(draftSections, specs);
  if (issues.length > 0) {
    return NextResponse.json({ ok: false, issues }, { status: 400 });
  }

  await db.update(exams).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(exams.id, exam.id));
  return NextResponse.json({ ok: true });
}
