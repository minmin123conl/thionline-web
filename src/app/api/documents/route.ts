import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import mammoth from "mammoth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai";

const MAX_BYTES = 4 * 1024 * 1024; // giới hạn body của hàm serverless (Neon/Vercel)

/** Nhận .docx/.pdf → lưu file gốc + trích text thuần JS (OCR chạy riêng sau này).
 *  PDF scan (không có lớp chữ) VẪN nhận vào, đánh dấu pdf_scan — OCR tiếng Việt sẽ
 *  xử lý từng trang trong màn duyệt. */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File quá lớn (tối đa ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  const isDocx = name.endsWith(".docx");
  const isPdf = name.endsWith(".pdf");
  if (!isDocx && !isPdf) {
    return NextResponse.json({ error: "Chỉ hỗ trợ .docx hoặc .pdf" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileData = buf.toString("base64");
  let text = "";
  let html: string | null = null;
  let fileType: "docx" | "pdf_text" | "pdf_scan" = isDocx ? "docx" : "pdf_text";
  let totalPages = 0;
  let scanNote = "";

  try {
    if (isDocx) {
      const [raw, converted] = await Promise.all([
        mammoth.extractRawText({ buffer: buf }),
        mammoth.convertToHtml({ buffer: buf }),
      ]);
      text = raw.value;
      html = converted.value.slice(0, 500_000);
    } else {
      // mupdf đọc text + số trang (pdf-parse gây lỗi DOMMatrix trên serverless Vercel)
      const { pdfExtractText } = await import("@/lib/ocr");
      const { text: pdfText, totalPages: pages } = await pdfExtractText(new Uint8Array(buf));
      text = pdfText;
      totalPages = pages;
      if (text.replace(/\s/g, "").length < 50) {
        fileType = "pdf_scan";
        scanNote = `PDF scan ${totalPages > 0 ? `${totalPages} trang` : ""} — chưa có lớp chữ, cần OCR để đọc (nút "OCR" trong màn bên phải).`;
      }
    }
  } catch (e) {
    return NextResponse.json({ error: `Không đọc được file: ${(e as Error).message}` }, { status: 422 });
  }

  const doc = await db
    .insert(documents)
    .values({
      teacherId: user.id,
      fileName: file.name,
      fileType,
      status: "UPLOADED",
      extractedText: text,
      extractedHtml: html,
      fileData,
      engine: "OFFLINE",
      totalPages,
      aiConfigured: isAIConfigured(),
    })
    .returning();
  const d = doc[0];
  return NextResponse.json({
    ok: true,
    document: {
      id: d.id,
      fileName: d.fileName,
      fileType: d.fileType,
      status: d.status,
      error: scanNote,
      totalPages: d.totalPages,
      extractedText: undefined,
      extractedHtml: undefined,
    },
  });
}

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  if (user.role === "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const pick = {
    id: documents.id, fileName: documents.fileName, fileType: documents.fileType,
    status: documents.status, error: documents.error, createdAt: documents.createdAt,
    extractCursor: documents.extractCursor, teacherId: documents.teacherId,
    totalPages: documents.totalPages, engine: documents.engine,
  };
  const rows =
    user.role === "ADMIN"
      ? await db.select(pick).from(documents).orderBy(desc(documents.createdAt))
      : await db.select(pick).from(documents).where(eq(documents.teacherId, user.id)).orderBy(desc(documents.createdAt));
  return NextResponse.json({ documents: rows });
}
