import katex from "katex";

/**
 * Render text đề bài hỗ trợ:
 *  - LaTeX ($...$ inline, $$...$$ block) — katex trust:false, an toàn XSS
 *  - Ảnh minh họa ![mô tả](data:image/...) — chỉ chấp nhận data-URL PNG/JPEG
 *  - Bảng markdown (| a | b |\n| --- | --- |) — build <table> thuần
 */

/** Tách text thành các phần: text / math / image / table */
type Part =
  | { type: "text"; value: string }
  | { type: "inline" | "block"; value: string }
  | { type: "image"; alt: string; src: string }
  | { type: "table"; rows: string[][] };

const DATAURL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/;

function parseParts(text: string): Part[] {
  const parts: Part[] = [];

  // Tách theo block: $$math$$ | ![img](src) | bảng markdown nhiều dòng
  const blockRe = /(\$\$[\s\S]+?\$\$|!\[([^\]]*)\]\((data:[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  const pushText = (t: string) => {
    if (!t) return;
    // trong text: tách bảng markdown + $inline$
    const lines = t.split("\n");
    let i = 0;
    while (i < lines.length) {
      // dò block bảng: dòng |...| theo sau bởi dòng |---|
      if (/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const rows: string[][] = [];
        const header = splitMdRow(lines[i]);
        rows.push(header);
        let j = i + 2;
        while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
          rows.push(splitMdRow(lines[j]));
          j++;
        }
        parts.push({ type: "table", rows });
        i = j;
        continue;
      }
      // text thường — tách $inline$ từng dòng
      const line = lines[i];
      const inlineRe = /\$([^$\n]+?)\$/g;
      let last2 = 0;
      let mm: RegExpExecArray | null;
      let lineHas = false;
      while ((mm = inlineRe.exec(line)) !== null) {
        if (mm.index > last2) parts.push({ type: "text", value: (lineHas ? "" : "") + line.slice(last2, mm.index) });
        parts.push({ type: "inline", value: mm[1] });
        last2 = mm.index + mm[0].length;
        lineHas = true;
      }
      if (last2 < line.length) parts.push({ type: "text", value: line.slice(last2) + (i + 1 < lines.length ? "\n" : "") });
      else if (i + 1 < lines.length && lineHas) parts.push({ type: "text", value: "\n" });
      else if (!lineHas && line) parts.push({ type: "text", value: line + "\n" });
      i++;
    }
  }

  while ((m = blockRe.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    if (m[2] !== undefined) {
      // ảnh — chỉ nhận data-URL an toàn
      parts.push({ type: "image", alt: m[2] || "hình minh họa", src: DATAURL_RE.test(m[3]) ? m[3] : "" });
    } else {
      parts.push({ type: "block", value: m[0].slice(2, -2) });
    }
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
  return parts;
}

function splitMdRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function renderMath(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, { throwOnError: false, displayMode, trust: false, strict: false });
  } catch {
    return "";
  }
}

export function TeX({ text, className }: { text: string; className?: string }) {
  const parts = parseParts(text);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === "text") {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {p.value}
            </span>
          );
        }
        if (p.type === "inline" || p.type === "block") {
          const html = renderMath(p.value, p.type === "block");
          return html ? (
            <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <span key={i} className="font-mono text-rose-600">
              {p.value}
            </span>
          );
        } else if (p.type === "image") {
          if (!p.src) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={p.src}
              alt={p.alt}
              className="my-3 max-w-full rounded-lg border border-line bg-surface"
              style={{ maxHeight: 360, objectFit: "contain" }}
              loading="lazy"
            />
          );
        } else if (p.type === "table") {
          return (
            <span key={i} className="my-3 block overflow-x-auto">
              <table className="min-w-[280px] border-collapse text-sm">
                <tbody>
                  {p.rows.map((row: string[], ri: number) => (
                    <tr key={ri} className={ri === 0 ? "bg-surface-2 font-medium" : ""}>
                      {row.map((cell: string, ci: number) => (
                        <td key={ci} className="border border-line px-3 py-1.5 text-left align-top">
                          <TeX text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </span>
          );
        }
        return null;
      })}
    </span>
  );
}
