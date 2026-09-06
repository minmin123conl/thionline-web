import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, extractedItems } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import type { ExtractedQuestion } from "@/lib/ai";

const patchSchema = z.object({
  payload: z.custom<ExtractedQuestion>((v) => typeof v === "object" && v !== null).optional(),
  status: z.enum(["PENDING", "APPROVED", "EDITED", "REJECTED"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const docRows = await db.select().from(documents).where(eq(documents.id, params.id));
  const doc = docRows[0];
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  if (user.role === "STUDENT" || (user.role !== "ADMIN" && doc.teacherId !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });

  const itemRows = await db
    .select()
    .from(extractedItems)
    .where(eq(extractedItems.id, params.itemId));
  const item = itemRows[0];
  if (!item || item.documentId !== doc.id) return NextResponse.json({ error: "Không tìm thấy câu" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (parsed.data.payload) {
    update.payload = parsed.data.payload as never;
    update.status = "EDITED";
    update.confidence = 1; // giáo viên đã sửa tay → tin cậy tuyệt đối
  }
  if (parsed.data.status) update.status = parsed.data.status;
  const updated = await db.update(extractedItems).set(update).where(eq(extractedItems.id, item.id)).returning();
  return NextResponse.json({ ok: true, item: updated[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const docRows = await db.select().from(documents).where(eq(documents.id, params.id));
  const doc = docRows[0];
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  if (user.role === "STUDENT" || (user.role !== "ADMIN" && doc.teacherId !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await db.delete(extractedItems).where(eq(extractedItems.id, params.itemId));
  return NextResponse.json({ ok: true });
}
