/**
 * OCR OFFLINE (không tốn API): render 1 trang PDF → PNG (mupdf/WASM) rồi nhận dạng
 * chữ bằng tesseract.js (tiếng Việt + Anh). Chạy server-side, KHÔNG cần Gemini.
 *
 * Thiết kế cho serverless: mỗi lần gọi chỉ xử lý MỘT trang (nhẹ, nằm trong giới hạn
 * thời gian hàm). Tiến độ trang do caller quản lý qua documents.ocrPagesDone.
 * Worker tesseract được cache module-level để reuse khi function còn ấm.
 */

// mupdf là ESM-only (top-level await) → phải import động
type MupdfModule = typeof import("mupdf");
let mupdfPromise: Promise<MupdfModule> | null = null;
function mupdf() {
  if (!mupdfPromise) mupdfPromise = import("mupdf");
  return mupdfPromise;
}

// tesseract: cache worker (tạo worker + tải traineddata khá tốn, chỉ làm 1 lần)
import type Tesseract from "tesseract.js";
let workerPromise: Promise<Tesseract.Worker> | null = null;
async function tesseractWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const t = await import("tesseract.js");
      const w = (t.default ?? t) as typeof t;
      return w.createWorker(["vie", "eng"], 1);
    })();
    // Nếu tạo worker thất bại (thiếu traineddata, lỗi tải), reset để request sau
    // trong cùng warm instance không bị kẹt mãi mãi với Promise rejected.
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

const RENDER_SCALE = 2; // 2x ≈ 144dpi, tốt cho OCR, PNG vẫn < ~1MB/trang

/** Render trang thứ index (0-based) của PDF thành PNG (Uint8Array) */
export async function renderPdfPageToPng(pdfBytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const m = await mupdf();
  const doc = m.Document.openDocument(pdfBytes);
  try {
    const page = doc.loadPage(pageIndex);
    const pix = page.toPixmap(m.Matrix.scale(RENDER_SCALE, RENDER_SCALE), m.ColorSpace.DeviceRGB, true, true);
    return pix.asPNG() as Uint8Array;
  } finally {
    doc.destroy?.();
  }
}

/** OCR 1 ảnh PNG (in-memory) → văn bản. tesseract.js Node nhận Buffer/Uint8Array. */
export async function ocrImageToText(png: Uint8Array): Promise<string> {
  const worker = await tesseractWorker();
  const { data } = await worker.recognize(png as never);
  return (data.text ?? "").trim();
}

/** Số trang của PDF (dùng mupdf) */
export async function pdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const m = await mupdf();
  const doc = m.Document.openDocument(pdfBytes);
  try {
    return doc.countPages();
  } finally {
    doc.destroy?.();
  }
}

/**
 * Đọc toàn bộ text của PDF có lớp chữ (dùng mupdf — thay pdf-parse).
 * mupdf là WASM tự chứa, không cần DOMMatrix/@napi-rs/canvas nên chạy ổn
 * trên serverless Vercel (pdf-parse throw "DOMMatrix is not defined").
 */
export async function pdfExtractText(pdfBytes: Uint8Array): Promise<{ text: string; totalPages: number }> {
  const m = await mupdf();
  const doc = m.Document.openDocument(pdfBytes);
  try {
    const totalPages = doc.countPages();
    const parts: string[] = [];
    for (let i = 0; i < totalPages; i++) {
      const page = doc.loadPage(i);
      try {
        const st = page.toStructuredText();
        parts.push(st.asText());
      } finally {
        page.destroy?.();
      }
    }
    return { text: parts.join("\n\n"), totalPages };
  } finally {
    doc.destroy?.();
  }
}

/** OCR trọn 1 trang PDF (render + nhận dạng). Caller tự quản lý index/progress. */
export async function ocrPdfPage(pdfBase64: string, pageIndex: number): Promise<string> {
  const bytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
  const png = await renderPdfPageToPng(bytes, pageIndex);
  return ocrImageToText(png);
}
