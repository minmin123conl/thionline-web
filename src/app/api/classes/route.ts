import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classMembers, classRooms } from "@/lib/db/schema";
import { requireRole, requireUser } from "@/lib/auth";
import { generateJoinCode } from "@/lib/constants";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "TEACHER" || user.role === "ADMIN") {
    const rows = user.role === "ADMIN"
      ? await db.select().from(classRooms)
      : await db.select().from(classRooms).where(eq(classRooms.teacherId, user.id));
    const withCounts = await Promise.all(
      rows.map(async (c) => {
        const members = await db.select({ userId: classMembers.userId }).from(classMembers).where(eq(classMembers.classId, c.id));
        return { ...c, memberCount: members.length };
      })
    );
    return NextResponse.json({ classes: withCounts });
  }
  const rows = await db
    .select({ id: classRooms.id, name: classRooms.name, joinCode: classRooms.joinCode, teacherId: classRooms.teacherId, createdAt: classRooms.createdAt })
    .from(classMembers)
    .innerJoin(classRooms, eq(classRooms.id, classMembers.classId))
    .where(eq(classMembers.userId, user.id));
  return NextResponse.json({ classes: rows });
}

const createSchema = z.object({ name: z.string().min(2).max(100) });

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireRole("TEACHER", "ADMIN");
  } catch (e) {
    return e as Response;
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tên lớp không hợp lệ" }, { status: 400 });

  for (let i = 0; i < 5; i++) {
    const code = generateJoinCode();
    const clash = await db.select({ id: classRooms.id }).from(classRooms).where(eq(classRooms.joinCode, code));
    if (clash.length > 0) continue;
    const inserted = await db
      .insert(classRooms)
      .values({ name: parsed.data.name.trim(), joinCode: code, teacherId: user.id })
      .returning();
    return NextResponse.json({ ok: true, classRoom: inserted[0] });
  }
  return NextResponse.json({ error: "Không tạo được mã lớp, thử lại" }, { status: 500 });
}
