import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classMembers, classRooms } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Card, EmptyState } from "@/components/ui";
import { CreateClassForm } from "@/components/CreateClassForm";

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

  const classes = await db.select().from(classRooms).where(eq(classRooms.teacherId, user.id)).orderBy(desc(classRooms.createdAt));
  const counts = new Map<string, number>();
  for (const c of classes) {
    const members = await db.select({ id: classMembers.id }).from(classMembers).where(eq(classMembers.classId, c.id));
    counts.set(c.id, members.length);
  }

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Lớp học</h1>
        <Card className="mt-4 p-4">
          <CreateClassForm />
        </Card>

        <div className="mt-6 space-y-3">
          {classes.length === 0 ? (
            <EmptyState title="Chưa có lớp nào" subtitle="Tạo lớp đầu tiên ở khung phía trên, sau đó gửi mã tham gia cho học sinh." />
          ) : (
            classes.map((c) => (
              <Link key={c.id} href={`/giao-vien/lop/${c.id}`}>
                <Card className="flex items-center justify-between p-4 transition-shadow hover:shadow-md">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-slate-500">{counts.get(c.id) ?? 0} học sinh · Tạo {c.createdAt.toLocaleDateString("vi-VN")}</p>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-slate-700">{c.joinCode}</span>
                </Card>
              </Link>
            ))
          )}
        </div>
      </main>
    </>
  );
}
