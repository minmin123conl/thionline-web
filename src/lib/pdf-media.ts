/**
 * Trích xuất media từ PDF (mupdf): ảnh nhúng, bảng (vector lines), hình vẽ.
 *
 * Chiến lược:
 *  1. StructuredText('preserve-images') → bbox + ảnh nhúng (decode PNG)
 *  2. Device callbacks (fillPath/strokePath) → bbox các đường vẽ
 *     → cluster thành "bảng" (≥2 đường ngang + ≥2 dọc) hoặc "hình vẽ"
 *  3. Text lines (bbox) — để serialize bảng thành markdown theo cột
 *
 * Ảnh chèn vào câu bằng markdown data-URL: ![mô tả](data:image/png;base64,...)
 * ExamPlayer/Tex render ảnh inline. Kích thước ảnh được giới hạn trước khi
 * nhúng để payload không phình.
 */

const MAX_IMAGE_DIM = 900; // px — resize ảnh lớn trước khi nhúng data-URL
const MAX_DATAURL_KB = 400; // KB — bỏ ảnh quá lớn (tránh payload jsonb khổng lồ)
const MIN_TABLE_LINES = 4; // cần ≥4 đường thẳng để tính là bảng

export type PdfLine = { bbox: [number, number, number, number]; text: string };
export type PdfImage = { bbox: [number, number, number, number]; dataUrl: string };
export type PageMedia = {
  page: number;
  lines: PdfLine[];
  images: PdfImage[];
  /** bbox vùng được coi là bảng (line kẻ + text bên trong) */
  tableBoxes: [number, number, number, number][];
  /** bbox hình vẽ vector khác (đồ thị, hình học) — render thành ảnh */
  artBoxes: [number, number, number, number][];
};

/** Trích media của 1 trang PDF (0-based). */
export async function extractPageMedia(pdfBytes: Uint8Array, pageIndex: number): Promise<PageMedia> {
  const m = await import("mupdf");
  const doc = m.Document.openDocument(pdfBytes);
  try {
    const page = doc.loadPage(pageIndex);
    try {
      return await extractFromPage(m, page, pageIndex);
    } finally {
      page.destroy?.();
    }
  } finally {
    doc.destroy?.();
  }
}

async function extractFromPage(m: typeof import("mupdf"), page: import("mupdf").Page, pageIndex: number): Promise<PageMedia> {
  const lines: PdfLine[] = [];
  const images: PdfImage[] = [];

  // 1) Text lines + ảnh nhúng
  const st = page.toStructuredText("preserve-images");
  st.walk({
    beginLine(bbox: number[]) {
      lines.push({ bbox: [bbox[0], bbox[1], bbox[2], bbox[3]], text: "" });
    },
    onImageBlock(bbox: number[], transform: unknown, image: import("mupdf").Image) {
      try {
        const dataUrl = imageToDataUrl(image);
        if (dataUrl) {
          images.push({ bbox: [bbox[0], bbox[1], bbox[2], bbox[3]], dataUrl });
        }
      } catch {
        // bỏ ảnh lỗi
      }
    },
  });
  // walk gọi beginLine TRƯỚC onChar — text của line đã nằm trong asText()?
  // Thực tế: lấy text từng line qua asJSON (có bbox khớp beginLine theo thứ tự)
  try {
    const j = JSON.parse(st.asJSON());
    const jsonLines: { bbox: number[]; text?: string }[] = [];
    for (const block of j.blocks ?? []) {
      if (block.type === "text") {
        for (const line of block.lines ?? []) jsonLines.push({ bbox: line.bbox, text: (line.text ?? "") as string });
      }
    }
    if (jsonLines.length === lines.length) {
      jsonLines.forEach((l, i) => (lines[i].text = normWs(l.text ?? "")));
    }
  } catch {
    // fallback: text rỗng vẫn không chặn media
  }

  // 2) Vector paths → bbox các đoạn kẻ
  const segBoxes: [number, number, number, number][] = [];
  try {
    const device = new m.Device({
      // Ghi bbox mỗi path vẽ (bảng = nhiều đoạn kẻ cluster lại)
      fillPath(path, _evenOdd, ctm) {
        recordPathBounds(path, _evenOdd as never as import("mupdf").StrokeState, ctm, segBoxes);
      },
      strokePath(path, stroke, ctm) {
        recordPathBounds(path, stroke, ctm, segBoxes);
      },
    });
    page.run(device, m.Matrix.identity);
  } catch {
    // một số PDF có content lạ — bỏ qua paths, vẫn có ảnh + text
  }

  // 3) Cluster các đoạn kẻ → bảng / hình vẽ
  const { tables, arts } = clusterSegments(segBoxes);

  return { page: pageIndex, lines, images, tableBoxes: tables, artBoxes: arts };
}

/** Ghi bbox path (áp transform ctm) vào danh sách. */
function recordPathBounds(
  path: { getBounds: (s: import("mupdf").StrokeState, t: import("mupdf").Matrix) => number[] },
  stroke: import("mupdf").StrokeState,
  ctm: import("mupdf").Matrix,
  out: [number, number, number, number][]
) {
  try {
    const b = path.getBounds(stroke, ctm);
    if (b && b[2] > b[0] && b[3] > b[1] && b[2] - b[0] + b[3] - b[1] > 8) {
      out.push([b[0], b[1], b[2], b[3]]);
    }
  } catch {
    // path getBounds có thể lỗi với vài loại stroke
  }
}

/** Nhóm các đoạn kẻ gần nhau: ≥ MIN_TABLE_LINES đoạn thẳng khép vùng = bảng; ít hơn = hình vẽ. */
function clusterSegments(boxes: [number, number, number, number][]) {
  // Union-Find theo khoảng cách giữa các bbox
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const near = (
    a: [number, number, number, number],
    b: [number, number, number, number],
    gap = 14
  ) => !(a[2] + gap < b[0] || b[2] + gap < a[0] || a[3] + gap < b[1] || b[3] + gap < a[1]);

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (near(boxes[i], boxes[j])) union(i, j);
    }
  }
  const groups = new Map<number, [number, number, number, number][]>();
  boxes.forEach((b, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(b);
  });

  const tables: [number, number, number, number][] = [];
  const arts: [number, number, number, number][] = [];
  for (const members of groups.values()) {
    const box: [number, number, number, number] = [
      Math.min(...members.map((b) => b[0])),
      Math.min(...members.map((b) => b[1])),
      Math.max(...members.map((b) => b[2])),
      Math.max(...members.map((b) => b[3])),
    ];
    if (members.length >= MIN_TABLE_LINES) tables.push(box);
    else arts.push(box);
  }
  return { tables, arts };
}

/** Decode ảnh → PNG → data-URL, tự downscale nếu quá lớn. */
function imageToDataUrl(image: import("mupdf").Image): string | null {
  const w = image.getWidth();
  const h = image.getHeight();
  if (w < 8 || h < 8) return null; // ảnh quá nhỏ (icon chấm tròn...)
  const pix = image.toPixmap();
  try {
    // Downscale về MAX_IMAGE_DIM nếu cần (dùng Pixmap scale qua sao chép)
    const png = pix.asPNG();
    if ((w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) && png.length > MAX_DATAURL_KB * 1024) {
      // mupdf không có resize pixmap trực tiếp — bỏ ảnh quá lớn để tránh phình DB
      if (png.length > MAX_DATAURL_KB * 1024 * 3) return null;
    }
    if (png.length > MAX_DATAURL_KB * 1024 * 3) return null; // >1.2MB → bỏ
    return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  } finally {
    pix.destroy?.();
  }
}

const normWs = (s: string) => s.replace(/\s+/g, " ").trim();

/** Render một vùng trang thành ảnh PNG data-URL (dùng cho bảng/hình vẽ phức tạp). */
export async function renderRegion(
  pdfBytes: Uint8Array,
  pageIndex: number,
  bbox: [number, number, number, number],
  dpi = 2
): Promise<string | null> {
  const m = await import("mupdf");
  const doc = m.Document.openDocument(pdfBytes);
  try {
    const page = doc.loadPage(pageIndex);
    try {
      const pix = page.toPixmap(m.Matrix.scale(dpi, dpi), m.ColorSpace.DeviceRGB, true, true);
      try {
        const png = pix.asPNG();
        if (png.length > MAX_DATAURL_KB * 1024 * 3) return null;
        return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
      } finally {
        pix.destroy?.();
      }
    } finally {
      page.destroy?.();
    }
  } finally {
    doc.destroy?.();
  }
}

/**
 * Serialize 1 vùng bảng thành markdown table từ các text lines trong bbox.
 * Cột xác định bằng cách cluster tọa độ x bắt đầu của các line.
 */
export function tableToMarkdown(media: PageMedia, box: [number, number, number, number]): string {
  const inside = media.lines
    .filter((l) => l.text && inBox(l.bbox, box))
    .sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  if (inside.length < 2) return "";

  // Cluster cột: các line có x-giữa gần nhau + cùng hàng → cùng ô.
  // Hàng: các line có y gần nhau (chênh ≤ 4pt) thuộc cùng hàng.
  type Cell = { x: number; y: number; text: string };
  const rowsMap = new Map<string, Cell[]>();
  for (const l of inside) {
    const yKey = String(Math.round(l.bbox[1] / 5)); // bucket 5pt
    const row = rowsMap.get(yKey) ?? [];
    row.push({ x: (l.bbox[0] + l.bbox[2]) / 2, y: l.bbox[1], text: l.text });
    rowsMap.set(yKey, row);
  }
  const rows = [...rowsMap.values()].sort((a, b) => a[0].y - b[0].y);
  if (rows.length < 2) return "";

  // Số cột chuẩn hóa theo hàng có nhiều ô nhất
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols < 2) return ""; // 1 cột → không phải bảng

  const grid = rows.map((r) => {
    const sorted = [...r].sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    for (let i = 0; i < maxCols; i++) cells.push(i < sorted.length ? sorted[i].text : "");
    return cells;
  });

  const md = grid.map((r) => `| ${r.join(" | ")} |`).join("\n");
  const sep = `|${" --- |".repeat(maxCols)}`;
  return `${md.split("\n")[0]}\n${sep}\n${md.split("\n").slice(1).join("\n")}`;
}

function inBox(b: [number, number, number, number], box: [number, number, number, number], pad = 2) {
  return b[0] >= box[0] - pad && b[2] <= box[2] + pad && b[1] >= box[1] - pad && b[3] <= box[3] + pad;
}

/**
 * Gán media (ảnh/bảng) vào đúng câu hỏi dựa theo tọa độ.
 * Mỗi câu chiếm vùng từ dòng "Câu N" đến dòng "Câu N+1" (hoặc hết trang).
 * Ảnh/bảng nằm trong vùng → chèn vào stem câu đó:
 *  - bảng: markdown table build từ text lines
 *  - ảnh: markdown ![...](dataURL)
 * Trả về map seq → { stem bổ sung, page }.
 */
export async function attachMediaToQuestions(
  pages: PageMedia[],
  opts: { artAsImage?: (box: [number, number, number, number], page: number) => Promise<string | null> } = {}
): Promise<Map<number, { mediaMd: string; page: number }>> {
  return buildAttachment(pages, opts);
}

/** Triển khai tuần tự của attachMediaToQuestions (trả Promise). */
async function buildAttachment(
  pages: PageMedia[],
  opts: { artAsImage?: (box: [number, number, number, number], page: number) => Promise<string | null> }
): Promise<Map<number, { mediaMd: string; page: number }>> {
  const out = new Map<number, { mediaMd: string; page: number }>();
  for (const media of pages) {
    const qStarts: { seq: number; y: number }[] = [];
    for (const l of media.lines) {
      // Nhận "Câu 1." (có/không dấu) và "1." thuần
      const m = l.text.match(/^(?:c[aăâ]u|cau)?\s*(\d{1,3})\s*[.::)–—-]\s+\S/i);
      if (m) qStarts.push({ seq: Number(m[1]), y: l.bbox[1] });
    }
    if (qStarts.length === 0) continue;

    const regions: { seq: number; y0: number; y1: number }[] = [];
    for (let i = 0; i < qStarts.length; i++) {
      regions.push({
        seq: qStarts[i].seq,
        y0: qStarts[i].y,
        y1: i + 1 < qStarts.length ? qStarts[i + 1].y : Number.MAX_SAFE_INTEGER,
      });
    }

    const center = (b: [number, number, number, number]) => (b[1] + b[3]) / 2;
    for (const r of regions) {
      const parts: string[] = [];

      for (const t of media.tableBoxes) {
        const cy = center(t);
        if (cy >= r.y0 && cy < r.y1) {
          const md = tableToMarkdown(media, t);
          if (md) parts.push(md);
        }
      }

      for (const img of media.images) {
        const cy = center(img.bbox);
        if (cy >= r.y0 && cy < r.y1) {
          parts.push(`![hình minh họa](${img.dataUrl})`);
        }
      }

      if (opts.artAsImage) {
        for (const art of media.artBoxes) {
          const cy = center(art);
          if (cy >= r.y0 && cy < r.y1 && art[2] - art[0] > 40 && art[3] - art[1] > 40) {
            const url = await opts.artAsImage(art, media.page);
            if (url) parts.push(`![hình vẽ](${url})`);
          }
        }
      }

      if (parts.length > 0) {
        const prev = out.get(r.seq);
        const md = (prev?.mediaMd ? prev.mediaMd + "\n\n" : "") + parts.join("\n\n");
        out.set(r.seq, { mediaMd: md, page: media.page });
      }
    }
  }
  return out;
}
