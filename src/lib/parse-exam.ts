import type { ExtractedQuestion } from "./types";

/**
 * Parser OFFLINE (không tốn API): cắt văn bản đề thi thành câu hỏi có cấu trúc
 * cho 3 loại: MC4 (A–D), TRUE_FALSE (4 ý đúng/sai), FILL (điền),
 * khớp đáp án từ bảng đáp án hoặc dòng "Đáp án:" trong đề.
 * Câu chưa khớp được đáp án vẫn trả về (answer=null) để giáo viên tự nhập ở màn duyệt.
 */

export type ParsedExam = {
  questions: ExtractedQuestion[];
  warnings: string[];
};

type RawQ = {
  seq: number;
  stem: string;
  options: { id: string; text: string }[]; // MC4
  statements: string[]; // TRUE_FALSE (4 ý)
  inlineAnswer: string | null;
  start: number;
};

const normLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Vị trí bắt đầu câu: ưu tiên "Câu 1."; nếu đề không dùng chữ "Câu" thì mới dùng dòng "1. Nội dung" */
export function findQuestionStarts(text: string): { seq: number; index: number }[] {
  const scan = (re: RegExp) => {
    const out: { seq: number; index: number }[] = [];
    const lines = text.split(/\n/);
    let lineStart = 0;
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const seq = Number(m[1]);
        if (seq >= 1 && seq <= 500) out.push({ seq, index: lineStart + (m.index ?? 0) });
      }
      lineStart += line.length + 1;
    }
    return out;
  };
  const withLabel = scan(/^\s*câu\s*(\d{1,3})\s*[.::)–—-]/i);
  if (withLabel.length >= 1) return withLabel;
  return scan(/^\s*(\d{1,3})\s*[.):]\s+\S/);
}

/** Tiêu đề phần: "PHẦN 1: TOÁN", "Phần II — Văn học" (chỉ nhận số hoặc số La Mã, tránh "Phần mềm...") */
export function findSections(text: string): { index: number; title: string }[] {
  const out: { index: number; title: string }[] = [];
  const lines = text.split(/\n/);
  let pos = 0;
  for (const line of lines) {
    if (/^\s*(?:PHẦN|Phần)\s+([IVX]{1,4}|\d{1,2})\b/i.test(line)) {
      out.push({ index: pos, title: normLine(line).slice(0, 90) });
    }
    pos += line.length + 1;
  }
  return out;
}

type Mark = { letter: string; index: number; end: number };

/** Tìm 4 option A/B/C/D HOA theo thứ tự (chữ thường a-d được dành cho dạng Đúng/Sai) */
function findOptions(block: string): Mark[] {
  const out: Mark[] = [];
  for (const m of block.matchAll(/\b([A-D])\s*[.):\-]\s+/g)) {
    const expect = "ABCD"[out.length];
    if (expect && m[1] === expect) {
      out.push({ letter: m[1], index: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** Tìm 4 ý a/b/c/d (hoa/thường) hoặc (1)-(4) hoặc i/ii/iii/iv — nhận khi đủ ĐÚNG 4 ý theo thứ tự */
function findStatements(block: string): Mark[] {
  const forms: [RegExp, string[]][] = [
    [/\b([A-Da-d])\s*[.):\-]\s+/g, ["a", "b", "c", "d"]],
    [/\b(1|2|3|4)\s*[.):]\s+/g, ["1", "2", "3", "4"]],
    [/\b(i|ii|iii|iv)\s*[.):]\s+/gi, ["i", "ii", "iii", "iv"]],
  ];
  for (const [re, labels] of forms) {
    const out: Mark[] = [];
    for (const m of block.matchAll(re)) {
      const expect = labels[out.length];
      if (!expect) break;
      if (m[0].trim().toLowerCase().startsWith(expect)) {
        out.push({ letter: expect.toUpperCase(), index: m.index, end: m.index + m[0].length });
      }
    }
    if (out.length === 4) return out;
  }
  return [];
}

/** Giá trị TRÔNG NHƯ ĐÁP ÁN: 1 chữ cái A-D/Đ, 4 ký tự Đ/S, hoặc số/biểu thức ngắn.
 *  Lọc khỏi nhiễu OCR như "5. Điền" (từ tiếng Việt) hay "Câu 4" (từ khóa). */
function looksLikeAnswerValue(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/^[A-DĐđ]$/.test(s)) return true;
  if (/^[DSĐđ](?:\s+[DSĐđ]){3}$/.test(s)) return true;
  // số, phân số, biểu thức ngắn: chỉ số, ký hiệu toán, dấu cách, chấm/phẩy
  return /^[\d\s.,:/×±%()\-+a-z]{1,25}$/.test(s) && /\d/.test(s) && !/[a-rt-vx-z]{2,}/i.test(s);
}

/** Bảng đáp án → Map(câu → chuỗi gốc). Nhận 2 dạng chính, chỉ nhận giá trị "trông như đáp án":
 *  Dạng 1 (inline): "1-A", "2) B", "5. 56"
 *  Dạng 2 (bảng 2 dòng): "Câu 1 2 3" / "Đ/A A B C"
 */
export function parseAnswerKey(text: string): Map<number, string> {
  const key = new Map<number, string>();
  const isDSToken = (t: string) => /^[DSĐđ]$/.test(t.trim());
  // Inline: "1-A", "2) B", "3. Đ S Đ S" — chỉ nhận CHỮ CÂI (không nhận số → tránh "x^2 - 4" thành đáp án).
  // Lookahead (?!\p{L}) loại "5. Điền..." (chữ sau "Đ" là phụ âm tiếng Việt → không phải đáp án).
  for (const m of text.matchAll(/\b(\d{1,3})\s*[-–—.:)]\s*([A-DĐđ](?:\s+[DSĐđ]){0,3})(?!\p{L})/gu)) {
    const seq = Number(m[1]);
    const val = normLine(m[2]);
    if (seq >= 1 && seq <= 500 && looksLikeAnswerValue(val)) key.set(seq, val);
  }
  // Bảng 2 dòng: "Câu 1 2 3" / "Đ/A A B C" (hoặc trộn TRUE_FALSE: "B C B D S Đ S 56 3").
  // Header PHẢI là dòng chỉ chứa "Câu" (tuỳ chọn) + các số — tránh bắt nhầm dòng đề bài.
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i].trim();
    const header = l1.match(/^\s*(?:câu)?\s*([\d][\d\s]*)$/i);
    if (!header) continue;
    const nums = header[1].trim().split(/\s+/).filter(Boolean);
    if (nums.length < 3) continue;
    const l2raw = lines[i + 1];
    if (!/[A-DĐđ]|đúng|sai/i.test(l2raw)) continue; // dòng giá trị phải chứa chữ (A–D/Đ/S) — tránh bảng số trong đề
    const l2 = l2raw.replace(/^\s*(?:đ[./ ]?\s*a\.?|đáp\s*án)\s*[:\-–—]?\s*/i, "");
    const tokens = l2.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === nums.length) {
      // 1-1: mỗi câu 1 ô
      nums.forEach((n, j) => {
        const v = normLine(tokens[j]);
        if (looksLikeAnswerValue(v)) key.set(Number(n), v);
      });
    } else {
      // Tiêu thụ tuần tự: ô Đ/S nếu theo sau 3 ô Đ/S nữa → đáp án TRUE_FALSE (4 ô)
      let p = 0;
      for (let j = 0; j < nums.length && p < tokens.length; j++) {
        const t = tokens[p];
        if (isDSToken(t) && p + 4 <= tokens.length && tokens.slice(p + 1, p + 4).every(isDSToken)) {
          const v = tokens.slice(p, p + 4).join(" ");
          if (looksLikeAnswerValue(v)) key.set(Number(nums[j]), v);
          p += 4;
        } else {
          const v = normLine(t);
          if (looksLikeAnswerValue(v)) key.set(Number(nums[j]), v);
          p += 1;
        }
      }
    }
  }
  return key;
}

/** Chuẩn hóa giá trị đáp án theo loại câu; null nếu không khớp.
 *  "Đ" được fold về "D" (chữ Đ của Đáp án = Đúng) ở mọi vị trí. */
export function normalizeAnswer(type: "MC4" | "FILL" | "TRUE_FALSE", raw: string): string | string[] | boolean[] | null {
  const v = raw.trim();
  if (!v) return null;
  if (type === "MC4") return /^[A-D]$/i.test(v) ? v.toUpperCase() : null;
  if (type === "FILL") return v.length > 40 ? null : v;
  const folded = v.replace(/[đĐ]/g, "D"); // "Đ" = Đúng
  const ds = folded.toUpperCase().match(/[DS]/g) ?? [];
  if (ds.length === 4) return [ds[0] === "D", ds[1] === "D", ds[2] === "D", ds[3] === "D"];
  const map: Record<string, boolean> = { đúng: true, d: true, sai: false, s: false };
  const words = v.toLowerCase().split(/[,;.\s]+/).filter(Boolean);
  if (words.length === 4 && words.every((w) => w in map)) return words.map((w) => map[w]);
  return null;
}

/** Cắt khối thô → câu hỏi có cấu trúc */
function blockToQuestion(raw: RawQ, key: Map<number, string>, section: string): ExtractedQuestion | null {
  const stem = normLine(raw.stem);
  if (stem.length < 3) return null;

  const keyRaw = key.get(raw.seq) ?? raw.inlineAnswer;
  let type: ExtractedQuestion["type"];
  let options: { id: string; text: string }[] | undefined;
  let answer: string | string[] | boolean[] | null = null;
  let confidence = 0.5;

  if (raw.options.length >= 2) {
    type = "MC4";
    options = raw.options.map((o) => ({ ...o }));
    if (keyRaw) {
      const a = normalizeAnswer("MC4", keyRaw);
      if (a !== null && options.some((o) => o.id === a)) {
        answer = a;
        confidence = 0.9;
      } else confidence = 0.6;
    } else confidence = 0.55;
  } else if (raw.statements.length === 4) {
    type = "TRUE_FALSE";
    options = raw.statements.map((s, i) => ({ id: "abcd"[i], text: s }));
    if (keyRaw) {
      const a = normalizeAnswer("TRUE_FALSE", keyRaw);
      if (Array.isArray(a) && a.length === 4) {
        answer = a;
        confidence = 0.85;
      } else confidence = 0.6;
    } else confidence = 0.5;
  } else {
    type = "FILL";
    if (keyRaw) {
      const a = normalizeAnswer("FILL", keyRaw);
      if (a !== null && typeof a === "string") {
        answer = [a];
        confidence = 0.8;
      }
    }
  }

  return {
    seq: raw.seq,
    type,
    stem: stem.slice(0, 4000),
    options,
    answer,
    explanation: "",
    sectionGuess: section || undefined,
    confidence: Math.round(confidence * 100) / 100,
    sourceSnippet: stem.slice(0, 120),
  };
}

function splitBlocks(text: string, starts: { seq: number; index: number }[]): RawQ[] {
  const out: RawQ[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    let block = text.slice(s.index, end);
    block = block.replace(/^\s*câu\s*\d{1,3}\s*[.::)–—-]?/i, "").replace(/^\s*\d{1,3}\s*[.):]\s*/, "");

    const q: RawQ = { seq: s.seq, stem: "", options: [], statements: [], inlineAnswer: null, start: s.index };

    // "Đáp án: X" ngay sau chữ "đáp án" — chỉ nhận khi giá trị TRÔNG NHƯ ĐÁP ÁN:
    // 1 chữ cái, 4 ký tự Đ/S, hoặc 1 từ ngắn (số, biểu thức). Tránh nuốt câu FILL
    // dạng "Điền đáp án: log_2(8) bằng ...." (nhiều từ → không phải đáp án).
    const looksLikeAnswer = (v: string) =>
      /^[A-DĐđ]$/.test(v) || /^[DSĐđ](?:\s+[DSĐđ]){3}$/.test(v) || /^\S{1,25}$/.test(v);
    for (const m of block.matchAll(/đáp\s+án\s*[:\-–—]\s*([^\n]{1,40})/gi)) {
      const val = normLine(m[1].replace(/[.,;]$/, ""));
      if (looksLikeAnswer(val)) {
        q.inlineAnswer = val;
        block = block.slice(0, m.index);
        break;
      }
    }

    const opts = findOptions(block);
    const stmts = opts.length >= 2 ? [] : findStatements(block);

    if (opts.length >= 2) {
      for (let j = 0; j < opts.length && j < 4; j++) {
        const to = j + 1 < opts.length ? opts[j + 1].index : block.length;
        q.options.push({ id: opts[j].letter, text: normLine(block.slice(opts[j].end, to)).slice(0, 2000) });
      }
      q.stem = block.slice(0, opts[0].index);
    } else if (stmts.length === 4) {
      for (let j = 0; j < 4; j++) {
        const to = j + 1 < 4 ? stmts[j + 1].index : block.length;
        q.statements.push(normLine(block.slice(stmts[j].end, to)).slice(0, 1000));
      }
      q.stem = block.slice(0, stmts[0].index);
    } else {
      // FILL: stem là toàn bộ khối, cắt ở dòng footer (PHẦN/ĐÁP ÁN/HẾT...) dính vào câu cuối
      q.stem = block
        .split("\n")
        .reduce<string[]>((acc, l) => {
          if (acc.length > 0 && /^\s*(?:PHẦN|Phần|ĐÁP\s*ÁN|HẾT\s+BÀI|KẾT\s+THÚC)/i.test(l)) return acc;
          acc.push(l);
          return acc;
        }, [])
        .join("\n");
    }
    out.push(q);
  }
  return out;
}

export function parseExamText(text: string): ParsedExam {
  const warnings: string[] = [];
  const clean = text.replace(/\u00a0/g, " ");
  const starts = findQuestionStarts(clean);
  if (starts.length < 1) {
    return {
      questions: [],
      warnings: ["Không nhận ra cấu trúc câu hỏi (cần các câu đánh số như 'Câu 1.'). Thử engine AI hoặc kiểm tra file."],
    };
  }
  const seqs = starts.map((s) => s.seq);
  const dup = seqs.filter((n, i) => seqs.indexOf(n) !== i);
  if (dup.length > 0) warnings.push(`Số câu bị lặp: ${[...new Set(dup)].slice(0, 10).join(", ")}`);

  const sections = findSections(clean);
  const key = parseAnswerKey(clean);
  const blocks = splitBlocks(clean, starts);

  const questions: ExtractedQuestion[] = [];
  let skipped = 0;
  for (const b of blocks) {
    let section = "";
    for (const s of sections) {
      if (s.index < b.start) section = s.title;
      else break;
    }
    const q = blockToQuestion(b, key, section);
    if (q) questions.push(q);
    else skipped++;
  }
  if (skipped > 0) warnings.push(`${skipped} khối không có đề bài (bảng/đề mục) đã bỏ qua.`);
  const noAnswer = questions.filter((q) => q.answer === null).length;
  if (noAnswer > 0) warnings.push(`${noAnswer} câu chưa có đáp án — nhập tay khi duyệt hoặc dùng AI tự sinh.`);
  return { questions, warnings };
}
