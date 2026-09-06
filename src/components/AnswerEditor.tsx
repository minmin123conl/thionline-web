"use client";

import { Input, Textarea } from "./ui";
import { TeX } from "./Tex";

export type Opt = { id: string; text: string };
export type Answer = string | string[] | boolean[] | null;

export const OPTION_IDS = ["A", "B", "C", "D"];
export const SUB_LABELS = ["a", "b", "c", "d"];

export function Mc4Editor({
  options,
  answer,
  onChange,
  readOnly,
  name,
}: {
  options: Opt[];
  answer: Answer;
  onChange: (patch: { options?: Opt[]; answer?: Answer }) => void;
  readOnly?: boolean;
  name: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Chọn đáp án đúng bằng nút tròn</p>
      {OPTION_IDS.map((oid, oi) => {
        const opt = options[oi] ?? { id: oid, text: "" };
        const checked = answer === oid;
        return (
          <div
            key={oid}
            className={`flex items-start gap-2 rounded-lg border p-2 ${checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}
          >
            <input
              type="radio"
              name={name}
              className="mt-2.5"
              disabled={readOnly}
              checked={checked}
              onChange={() => onChange({ answer: oid })}
            />
            <span className="mt-1.5 w-5 text-sm font-semibold text-slate-500">{oid}.</span>
            {readOnly ? (
              <span className="flex-1 py-1.5 text-sm">
                <TeX text={opt.text} />
              </span>
            ) : (
              <Textarea
                rows={2}
                className="flex-1"
                value={opt.text}
                placeholder={`Lựa chọn ${oid}`}
                onChange={(e) =>
                  onChange({
                    options: OPTION_IDS.map((id, i) => ({
                      id,
                      text: i === oi ? e.target.value : options[i]?.text ?? "",
                    })),
                  })
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FillEditor({
  answer,
  onChange,
  readOnly,
}: {
  answer: Answer;
  onChange: (patch: { answer?: Answer }) => void;
  readOnly?: boolean;
}) {
  const accepted = Array.isArray(answer) ? (answer.filter((v): v is string => typeof v === "string") as string[]) : [];
  if (readOnly) {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm">{accepted.join(" | ") || "(chưa có đáp án)"}</p>;
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">
        Đáp án chấp nhận — mỗi dòng một đáp án (không phân biệt hoa thường, số so theo giá trị: 0,5 = 0.5)
      </p>
      <Textarea
        rows={3}
        value={accepted.join("\n")}
        placeholder={"42\n42,0"}
        onChange={(e) =>
          onChange({ answer: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })
        }
      />
    </div>
  );
}

export function TrueFalseEditor({
  options,
  answer,
  onChange,
  readOnly,
}: {
  options: Opt[];
  answer: Answer;
  onChange: (patch: { options?: Opt[]; answer?: Answer }) => void;
  readOnly?: boolean;
}) {
  const subs = Array.isArray(answer) && answer.length === 4 && answer.every((v) => typeof v === "boolean")
    ? (answer as boolean[])
    : [false, false, false, false];
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">4 ý a–d, học sinh được tính điểm từng ý (mỗi ý ¼ điểm câu)</p>
      {SUB_LABELS.map((lb, li) => (
        <div key={lb} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
          <span className="w-5 text-sm font-semibold text-slate-500">{lb}.</span>
          <div className="flex shrink-0 gap-1">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={readOnly}
                onClick={() => onChange({ answer: subs.map((x, i) => (i === li ? v : x)) })}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  subs[li] === v
                    ? v
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {v ? "Đúng" : "Sai"}
              </button>
            ))}
          </div>
          {readOnly ? (
            <span className="flex-1 text-sm">
              <TeX text={options[li]?.text ?? ""} />
            </span>
          ) : (
            <Input
              className="flex-1"
              placeholder={`Nội dung ý ${lb}`}
              value={options[li]?.text ?? ""}
              onChange={(e) =>
                onChange({
                  options: SUB_LABELS.map((id, i) => ({ id, text: i === li ? e.target.value : options[i]?.text ?? "" })),
                })
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Bản tóm tắt đáp án dạng chỉ-đọc, dùng ở dòng thu gọn */
export function AnswerSummary({ type, answer }: { type: string; answer: Answer }) {
  if (type === "MC4") return <span className="font-semibold text-emerald-700">{typeof answer === "string" ? answer : "?"}</span>;
  if (type === "FILL") {
    const list = Array.isArray(answer) ? (answer as string[]) : [];
    return <span className="text-emerald-700">{list.length ? list.join(" | ") : "?"}</span>;
  }
  const subs = Array.isArray(answer) ? (answer as boolean[]) : [];
  return (
    <span className="text-emerald-700">
      {subs.length === 4 ? subs.map((b, i) => `${SUB_LABELS[i]}:${b ? "Đ" : "S"}`).join(" ") : "?"}
    </span>
  );
}
