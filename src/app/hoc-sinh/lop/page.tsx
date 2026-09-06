import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classMembers, classRooms, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Card, EmptyState } from "@/components/ui";
import { JoinClassForm } from "@/components/JoinClassForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lớp của tôi — ThiOnline" };

export default async function MyClasses() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role !== "STUDENT") redirect("/");

  const rows = await db
    .select({
      id: classRooms.id,
      name: classRooms.name,
      joinCode: classRooms.joinCode,
      teacherName: users.name,
      joinedAt: classMembers.joinedAt,
    })
    .from(classMembers)
    .innerJoin(classRooms, eq(classRooms.id, classMembers.classId))
    .innerJoin(users, eq(users.id, classRooms.teacherId))
    .where(eq(classMembers.userId, user.id));

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Lớp của tôi</h1>
        <Card className="mt-4 p-4">
          <p className="mb-3 text-sm text-slate-600">Nhập mã lớp (6 ký tự) do giáo viên cung cấp để nhận đề kiểm tra:</p>
          <JoinClassForm />
        </Card>

        <h2 className="mb-3 mt-8 text-lg font-semibold">Đang tham gia</h2>
        {rows.length === 0 ? (
          <EmptyState title="Chưa tham gia lớp nào" subtitle="Nhập mã lớp ở khung phía trên." />
        ) : (
          <div className="space-y-3">
            {rows.map((c) => (
              <Card key={c.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-slate-500">Giáo viên: {c.teacherName} · Tham gia {c.joinedAt.toLocaleDateString("vi-VN")}</p>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm font-semibold tracking-widest text-slate-700">{c.joinCode}</span>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
