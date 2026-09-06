import katex from "katex";

/** Render text có công thức LaTeX ($...$ inline, $$...$$ block) — katex trust:false, an toàn XSS */
export function TeX({ text, className }: { text: string; className?: string }) {
  const parts: { type: "text" | "inline" | "block"; value: string }[] = [];
  const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ type: "block", value: m[1] });
    else parts.push({ type: "inline", value: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

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
        let html: string;
        try {
          html = katex.renderToString(p.value, {
            throwOnError: false,
            displayMode: p.type === "block",
            trust: false,
            strict: false,
          });
        } catch {
          html = "";
        }
        return html ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={i} className="font-mono text-rose-600">
            {p.value}
          </span>
        );
      })}
    </span>
  );
}
