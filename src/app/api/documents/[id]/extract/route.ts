import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, extractedItems } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { extractPendingDocument, resetExtract } from "@/lib/extract";

/**
 * Tiến hành MỘT bước đọc tài liệu (logic lõi ở lib/extract.ts — dùng chung với cron).
 * Engine OFFLINE (mặc định): OCR offline + parser thuần, KHÔNG tốn API.
 * Engine AI: Gemini free tier (bị cap số lượt gọi theo tài liệu).
 * Body POST: { engine?: "OFFLINE" | "AI" }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const docRows = await db.select().from(documents).where(eq(documents.id, params.id));
  const doc = docRows[0];
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  if (user.role !== "ADMIN" && doc.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const engine: "OFFLINE" | "AI" = body?.engine === "AI" ? "AI" : "OFFLINE";

  const r = await extractPendingDocument(doc.id, engine);
  if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: r.extracted > 0 ? 200 : 502 });
  return NextResponse.json({
    ok: true,
    done: r.completed,
    extracted: r.extracted,
    cursor: r.cursor,
    total: r.total,
    stage: r.stage,
    pagesDone: r.pagesDone ?? 0,
    totalPages: r.totalPages ?? doc.totalPages,
  });
}

/** Parse lại từ đầu: xóa items + reset tiến độ (giữ file gốc & text đã OCR) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const docRows = await db.select().from(documents).where(eq(documents.id, params.id));
  const doc = docRows[0];
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  if (user.role !== "ADMIN" && doc.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await resetExtract(doc.id);
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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
  const items = await db.select().from(extractedItems).where(eq(extractedItems.documentId, doc.id));
  items.sort((a, b) => a.seq - b.seq);
  const sourceText = doc.fileType === "pdf_scan" ? doc.parsedText : doc.extractedText;
  return NextResponse.json({
    document: {
      ...doc,
      extractedHtml: undefined,
      extractedText: sourceText.slice(0, 200_000),
      parsedText: undefined,
      fileData: undefined,
    },
    items,
  });
}
