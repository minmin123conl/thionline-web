import { redirect } from "next/navigation";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, classMembers, classRooms, exams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { ClassesTable, type ClassRow } from "@/components/ClassesTable";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lớp học — ThiOnline" };

export default async function TeacherClasses() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const classRows = await db
    .select()
    .from(classRooms)
    .where(eq(classRooms.teacherId, user.id))
    .orderBy(desc(classRooms.createdAt));

  // Đếm học sinh mỗi lớp bằng 1 query (groupBy) — tránh N+1
  const classIds = classRows.map((c) => c.id);
  const countRows =
    classIds.length > 0
      ? await db
          .select({ classId: classMembers.classId, n: sql<number>`count(*)` })
          .from(classMembers)
          .where(inArray(classMembers.classId, classIds))
          .groupBy(classMembers.classId)
      : [];
  const counts = new Map(countRows.map((r) => [r.classId, Number(r.n)]));

  // Đề đã giao cho các lớp này (kèm tên đề gốc) — 1 query
  const asgRows =
    classIds.length > 0
      ? await db
          .select({
            id: assignments.id,
            classId: assignments.classId,
            title: assignments.title,
            opensAt: assignments.opensAt,
            closesAt: assignments.closesAt,
            examTitle: exams.title,
          })
          .from(assignments)
          .innerJoin(exams, eq(exams.id, assignments.examId))
          .where(inArray(assignments.classId, classIds))
          .orderBy(desc(assignments.createdAt))
      : [];
  const asgByClass = new Map<string, ClassRow["assignments"]>();
  for (const a of asgRows) {
    const list = asgByClass.get(a.classId) ?? [];
    list.push({ id: a.id, title: a.title || a.examTitle, opensAt: a.opensAt?.toISOString() ?? null, closesAt: a.closesAt?.toISOString() ?? null });
    asgByClass.set(a.classId, list);
  }

  const classes: ClassRow[] = classRows.map((c) => ({
    id: c.id,
    name: c.name,
    joinCode: c.joinCode,
    memberCount: counts.get(c.id) ?? 0,
    createdAt: c.createdAt.toISOString(),
    assignments: asgByClass.get(c.id) ?? [],
  }));

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">Lớp học</h1>
        <p className="mt-1 text-sm text-slate-500">Toàn bộ lớp bạn sở hữu — mã mời, học sinh và đề đã giao.</p>
        <div className="mt-5">
          <ClassesTable initialClasses={classes} />
        </div>
      </main>
    </>
  );
}
