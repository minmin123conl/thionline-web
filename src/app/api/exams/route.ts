import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { examTemplates, exams, sections } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { parseSectionsSpec } from "@/lib/templates";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows =
    user.role === "ADMIN"
      ? await db.select().from(exams).orderBy(desc(exams.createdAt))
      : await db.select().from(exams).where(eq(exams.teacherId, user.id)).orderBy(desc(exams.createdAt));
  return NextResponse.json({ exams: rows });
}

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().default(""),
  templateCode: z.string().optional().nullable(),
  totalMinutes: z.number().int().min(1).max(600).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu tạo đề không hợp lệ" }, { status: 400 });
  const { title, description, templateCode, totalMinutes } = parsed.data;

  let template: { code: string; sectionsSpec: unknown; totalMinutes: number } | null = null;
  if (templateCode) {
    const rows = await db.select().from(examTemplates).where(eq(examTemplates.code, templateCode));
    if (rows.length === 0) return NextResponse.json({ error: "Khuôn kỳ thi không tồn tại" }, { status: 400 });
    template = { code: rows[0].code, sectionsSpec: rows[0].sectionsSpec, totalMinutes: rows[0].totalMinutes };
  }

  const inserted = await db
    .insert(exams)
    .values({
      title: title.trim(),
      description: description ?? "",
      teacherId: user.role === "ADMIN" ? null : user.id,
      templateCode: template?.code ?? null,
      totalMinutes: template ? template.totalMinutes : totalMinutes ?? null,
      shuffleQuestions: template ? false : true, // đề khuôn giữ đúng thứ tự như thi thật
      shuffleOptions: template ? false : true,
    })
    .returning();
  const exam = inserted[0];

  if (template) {
    const specs = parseSectionsSpec(JSON.stringify(template.sectionsSpec));
    if (specs.length > 0) {
      await db.insert(sections).values(
        specs.map((s, i) => ({
          examId: exam.id,
          code: s.code,
          title: s.title,
          position: i + 1,
          minutes: s.minutes,
        }))
      );
    }
  } else {
    await db.insert(sections).values({ examId: exam.id, code: "PART1", title: "Phần 1", position: 1, minutes: totalMinutes ?? 45 });
  }

  return NextResponse.json({ ok: true, exam });
}
