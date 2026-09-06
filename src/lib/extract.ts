import { and, eq, isNull, lte, or, sql, type InferSelectModel } from "drizzle-orm";
import { db } from "./db";

type DocRow = InferSelectModel<typeof documents>;
import { documents, extractedItems } from "./db/schema";
import { extractQuestions, isAIConfigured } from "./ai";
import { parseExamText } from "./parse-exam";
import { ocrPdfPage, pdfPageCount } from "./ocr";
import type { ExtractedQuestion } from "./types";
import { reserveDocumentAiCall, releaseDocumentAiCall } from "./ai-usage";

const CHUNK_CHARS = 9000;
/** Guardrail chi phí: giới hạn số lượt gọi Gemini (trích xuất) cho MỘT tài liệu */
export const MAX_AI_CALLS_PER_DOC = 200;

/** Cắt đoạn text tiếp theo, ưu tiên đứt ở ranh giới "Câu N" để không xé đôi câu hỏi */
export function nextChunk(text: string, cursor: number): string {
  if (cursor >= text.length) return "";
  let end = Math.min(text.length, cursor + CHUNK_CHARS);
  if (end < text.length) {
    const window = text.slice(cursor, end);
    const m = [...window.matchAll(/Câu\s+\d+/g)];
    if (m.length >= 2) {
      end = cursor + m[m.length - 1].index!;
    }
  }
  return text.slice(cursor, Math.max(end, cursor + 500));
}

export type ExtractStepResult = {
  advanced: boolean; // có tiến thêm được 1 bước không
  completed: boolean; // đã xong toàn bộ văn bản (status → NEEDS_REVIEW)
  extracted: number; // số câu mới trong bước này
  cursor: number;
  total: number;
  stage: "OCR" | "PARSE" | "AI" | "DONE";
  pagesDone?: number;
  totalPages?: number;
  error?: string;
};

/**
 * Tiến hành MỘT bước đọc tài liệu (an toàn serverless: mỗi call = 1 việc ngắn).
 * Dùng chung cho POST /api/documents/[id]/extract (client bấm) và cron server-side.
 *
 * ENGINE OFFLINE (mặc định, KHÔNG tốn API):
 *  - PDF scan: OCR 1 trang/call (tesseract offline) → gom vào parsedText
 *  - khi đủ trang (hoặc docx/PDF có chữ): parse thuần → câu hỏi có cấu trúc
 * ENGINE AI (Gemini free tier):
 *  - cắt 9000 ký tự/call → Gemini đọc thành câu hỏi (aiCalls bị cap theo tài liệu)
 *
 * Idempotent: OFFLINE theo ocrPagesDone + parsedDone; AI theo extractCursor.
 */
export async function extractPendingDocument(docId: string, engine: "OFFLINE" | "AI" = "OFFLINE"): Promise<ExtractStepResult> {
  const docRows = await db.select().from(documents).where(eq(documents.id, docId));
  const doc = docRows[0];
  if (!doc) return { advanced: false, completed: false, extracted: 0, cursor: 0, total: 0, stage: "DONE", error: "Không tìm thấy tài liệu" };
  if (doc.status === "IMPORTED") return { advanced: false, completed: true, extracted: 0, cursor: doc.extractCursor, total: doc.extractedText.length, stage: "DONE" };
  const eng = engine === "AI" && isAIConfigured() ? "AI" : "OFFLINE";

  // Khóa ngắn theo tài liệu để client ("Đọc") và cron không xử lý cùng một bước song song.
  // Khóa tự hết sau 60s (OCR 1 trang có thể lâu) — process chết cũng không kẹt vĩnh viễn.
  const now = new Date();
  const lockUntil = new Date(now.getTime() + 60_000);
  const free = await db
    .update(documents)
    .set({ lockedUntil: lockUntil })
    .where(
      and(
        eq(documents.id, doc.id),
        or(isNull(documents.lockedUntil), lte(documents.lockedUntil, now))
      )
    )
    .returning({ id: documents.id });
  if (free.length === 0) {
    const f = (await db.select().from(documents).where(eq(documents.id, docId)))[0]!;
    return { advanced: false, completed: false, extracted: 0, cursor: f.extractCursor, total: f.extractedText.length, stage: "DONE" };
  }

  try {
    // Đọc lại SAU khi giữ khóa — tránh dùng trạng thái cũ
    const fresh = (await db.select().from(documents).where(eq(documents.id, docId)))[0]!;

    if (eng === "OFFLINE") return runOfflineStep(docId, fresh);
    return runAiStep(docId, fresh);
  } catch (e) {
    const msg = (e as Error).message;
    await db.update(documents).set({ status: "FAILED", error: msg }).where(eq(documents.id, docId));
    return { advanced: false, completed: false, extracted: 0, cursor: doc.extractCursor, total: doc.extractedText.length, stage: "DONE", error: msg };
  } finally {
    try {
      await db.update(documents).set({ lockedUntil: null }).where(eq(documents.id, docId));
    } catch {}
  }
}

/** Xóa items + reset tiến độ parse (giữ nguyên file gốc & text đã OCR — không phải OCR lại) */
export async function resetExtract(docId: string) {
  await db.delete(extractedItems).where(eq(extractedItems.documentId, docId));
  await db
    .update(documents)
    .set({ extractCursor: 0, parsedDone: false, status: "UPLOADED", error: "" })
    .where(eq(documents.id, docId));
}

/**
 * 1 bước ENGINE OFFLINE:
 *  - pdf_scan chưa hết trang → OCR đúng 1 trang
 *  - đủ trang (hoặc không phải scan) → parse toàn bộ văn bản (1 lần, idempotent)
 */
async function runOfflineStep(docId: string, doc: DocRow): Promise<ExtractStepResult> {
  const total = doc.extractedText.length || doc.parsedText.length;

  // Giai đoạn 1: OCR từng trang cho bản scan
  if (doc.fileType === "pdf_scan" && doc.ocrPagesDone < doc.totalPages) {
    if (doc.totalPages <= 0) {
      // Không xác định được số trang (metadata PDF hỏng) → thử đếm lại từ file gốc
      if (doc.fileData) {
        try {
          const pages = await pdfPageCount(new Uint8Array(Buffer.from(doc.fileData, "base64")));
          if (pages > 0) {
            await db.update(documents).set({ totalPages: pages }).where(eq(documents.id, docId));
            return { advanced: false, completed: false, extracted: 0, cursor: 0, total, stage: "OCR", pagesDone: doc.ocrPagesDone, totalPages: pages };
          }
        } catch {}
      }
      await db.update(documents).set({ status: "FAILED", error: "Không xác định được số trang PDF — tải lại file" }).where(eq(documents.id, docId));
      return { advanced: false, completed: false, extracted: 0, cursor: 0, total, stage: "OCR", error: "Không xác định được số trang PDF" };
    }
    if (!doc.fileData) {
      await db.update(documents).set({ status: "FAILED", error: "Thiếu file gốc — không OCR được (tải lại file)" }).where(eq(documents.id, docId));
      return { advanced: false, completed: false, extracted: 0, cursor: 0, total, stage: "OCR", error: "Thiếu file gốc — tải lại file để OCR" };
    }
    await db.update(documents).set({ status: "PROCESSING" }).where(eq(documents.id, docId));
    const text = await ocrPdfPage(doc.fileData, doc.ocrPagesDone);
    const parsedText = (doc.parsedText ? doc.parsedText + "\n" : "") + text;
    const ocrPagesDone = doc.ocrPagesDone + 1;
    await db.update(documents).set({ parsedText, ocrPagesDone, status: "PROCESSING" }).where(eq(documents.id, docId));
    return { advanced: true, completed: false, extracted: 0, cursor: 0, total, stage: "OCR", pagesDone: ocrPagesDone, totalPages: doc.totalPages };
  }

  // Giai đoạn 2: parse văn bản → câu hỏi (chỉ 1 lần)
  if (!doc.parsedDone) {
    const text = (doc.fileType === "pdf_scan" ? doc.parsedText : doc.extractedText) || "";
    if (!text.replace(/\s/g, "").length) {
      await db.update(documents).set({ status: "FAILED", error: "Không có nội dung để đọc (file rỗng hoặc OCR không nhận ra chữ)" }).where(eq(documents.id, docId));
      return { advanced: false, completed: true, extracted: 0, cursor: 0, total, stage: "PARSE", error: "Không có nội dung để đọc" };
    }
    await db.update(documents).set({ status: "PROCESSING" }).where(eq(documents.id, docId));
    const { questions, warnings } = parseExamText(text);
    const items = questions.map((q: ExtractedQuestion, i: number) => ({
      documentId: docId,
      seq: i + 1,
      type: "QUESTION",
      payload: q as never,
      confidence: typeof q.confidence === "number" ? Math.max(0, Math.min(1, q.confidence)) : 0,
      sourcePage: null,
      status: "PENDING",
    }));
    if (items.length > 0) await db.insert(extractedItems).values(items);
    const error = items.length === 0 ? (warnings[0] ?? "Không nhận ra câu hỏi trong file") : "";
    await db
      .update(documents)
      .set({ parsedDone: true, status: "NEEDS_REVIEW", error, engine: "OFFLINE" })
      .where(eq(documents.id, docId));
    return { advanced: items.length > 0, completed: true, extracted: items.length, cursor: 0, total, stage: "PARSE" };
  }

  // Đã xong
  const count = (await db.select({ n: sql<number>`count(*)` }).from(extractedItems).where(eq(extractedItems.documentId, docId)))[0];
  return { advanced: false, completed: true, extracted: Number(count?.n ?? 0), cursor: 0, total, stage: "DONE" };
}

/** 1 bước ENGINE AI: cắt 1 lô 9000 ký tự → Gemini (bị cap bởi aiCalls) */
async function runAiStep(docId: string, doc: DocRow): Promise<ExtractStepResult> {
  if (!isAIConfigured()) {
    return { advanced: false, completed: false, extracted: 0, cursor: doc.extractCursor, total: doc.extractedText.length, stage: "AI", error: "Chưa cấu hình Gemini API key trên máy chủ" };
  }
  const text = doc.fileType === "pdf_scan" ? doc.parsedText || doc.extractedText : doc.extractedText;
  const cursor = doc.extractCursor;

  const chunk = nextChunk(text, cursor);
  if (!chunk) {
    await db.update(documents).set({ status: "NEEDS_REVIEW", engine: "AI" }).where(eq(documents.id, docId));
    return { advanced: false, completed: true, extracted: 0, cursor, total: text.length, stage: "AI" };
  }

  const aiCalls = await reserveDocumentAiCall(docId, "extraction", MAX_AI_CALLS_PER_DOC);
  if (aiCalls === null) {
    return { advanced: false, completed: false, extracted: 0, cursor, total: text.length, stage: "AI", error: `Đã đạt giới hạn ${MAX_AI_CALLS_PER_DOC} lượt gọi AI cho tài liệu này. Dùng engine OFFLINE hoặc cắt nhỏ file.` };
  }
  await db.update(documents).set({ status: "PROCESSING", engine: "AI" }).where(eq(documents.id, docId));
  let out;
  try {
    out = await extractQuestions(chunk);
  } catch (e) {
    // Lời gọi AI thất bại — hoàn lại lượt đã reserve, không tiêu quota oan
    await releaseDocumentAiCall(docId, "extraction");
    throw e;
  }
  const existing = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(${extractedItems.seq}), 0)` })
    .from(extractedItems)
    .where(eq(extractedItems.documentId, docId));
  let seq = Number(existing[0]?.maxSeq ?? 0);
  const items = (out.questions ?? []).map((q) => {
    seq += 1;
    return {
      documentId: docId,
      seq,
      type: "QUESTION",
      payload: q as never,
      confidence: typeof q.confidence === "number" ? Math.max(0, Math.min(1, q.confidence)) : 0,
      sourcePage: null,
      status: "PENDING",
    };
  });
  if (items.length > 0) await db.insert(extractedItems).values(items);
  const newCursor = Math.min(cursor + chunk.length, text.length);
  const done = newCursor >= text.length;
  await db
    .update(documents)
    .set({ extractCursor: newCursor, status: done ? "NEEDS_REVIEW" : "PROCESSING", aiConfigured: true })
    .where(eq(documents.id, docId));
  return { advanced: true, completed: done, extracted: items.length, cursor: newCursor, total: text.length, stage: "AI" };
}
