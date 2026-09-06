"use client";

import { useState } from "react";
import { TeX } from "./Tex";

type ResultQuestion = {
  id: string;
  sectionTitle: string;
  type: string;
  stem: string;
  options: { id: string; text: string }[];
  studentAnswer: unknown;
  correctAnswer: unknown;
  earned: number;
  points: number;
  correct: boolean;
  explanation: string;
  timeSpentMs: number;
};

function fmtAnswer(type: string, ans: unknown, options: { id: string; text: string }[]): string {
  if (ans == null || ans === "") return "(không trả lời)";
  if (type === "MC4") {
    const o = options.find((x) => x.id === ans);
    return o ? `${o.id}. ${o.text.replace(/\$/g, "")}` : String(ans);
  }
  if (type === "FILL") return String(ans);
  if (type === "TRUE_FALSE" && Array.isArray(ans)) {
    return ["a", "b", "c", "d"].map((l, i) => `${l}) ${ans[i] === true ? "Đúng" : ans[i] === false ? "Sai" : "—"}`).join("  ");
  }
  return JSON.stringify(ans);
}

export function ResultReview({ questions }: { questions: ResultQuestion[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [onlyWrong, setOnlyWrong] = useState(true);
  const shown = onlyWrong ? questions.filter((q) => !q.correct) : questions;
  const avgTime = questions.length
    ? questions.reduce((a, q) => a + q.timeSpentMs, 0) / questions.length
    : 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Xem lại bài làm</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} />
          Chỉ hiện câu sai ({questions.filter((q) => !q.correct).length})
        </label>
      </div>
      {shown.length === 0 && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm font-medium text-emerald-800">
          🎉 Tuyệt vời! Bạn không sai câu nào.
        </p>
      )}
      <div className="space-y-3">
        {shown.map((q, i) => {
          const slow = q.timeSpentMs > avgTime * 2 && avgTime > 0;
          return (
            <div key={q.id} className={`rounded-xl border bg-white p-4 ${q.correct ? "border-emerald-200" : "border-rose-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-400">{q.sectionTitle}</p>
                  <div className="mt-1 text-[15px] leading-relaxed">
                    <b className="mr-1">{i + 1}.</b>
                    <TeX text={q.stem} />
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${q.correct ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>
                  {q.correct ? `+${q.earned}` : q.earned > 0 ? `${q.earned}/${q.points}` : "Sai"}
                </span>
              </div>

              {q.type === "MC4" && q.options.length > 0 && (
                <div className="mt-3 space-y-1">
                  {q.options.map((o) => {
                    const isPicked = q.studentAnswer === o.id;
                    const isRight = q.correctAnswer === o.id;
                    return (
                      <div
                        key={o.id}
                        className={`rounded-lg px-3 py-1.5 text-sm ${
                          isRight ? "bg-emerald-50 font-medium text-emerald-900" : isPicked ? "bg-rose-50 text-rose-800 line-through decoration-rose-300" : "text-slate-600"
                        }`}
                      >
                        <b className="mr-1.5">{o.id}.</b>
                        <TeX text={o.text} />
                        {isRight && <span className="ml-2 text-xs font-bold text-emerald-700">✓ Đáp án đúng</span>}
                        {isPicked && !isRight && <span className="ml-2 text-xs text-rose-600">Bạn chọn</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {q.type !== "MC4" && (
                <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                  <p className="rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="text-xs text-slate-400">Trả lời của bạn: </span>
                    <TeX text={fmtAnswer(q.type, q.studentAnswer, q.options)} />
                  </p>
                  <p className="rounded-lg bg-emerald-50 px-3 py-1.5">
                    <span className="text-xs text-emerald-600">Đáp án đúng: </span>
                    <TeX text={fmtAnswer(q.type, q.correctAnswer, q.options)} />
                  </p>
                </div>
              )}

              {slow && (
                <p className="mt-2 text-xs text-amber-700">
                  ⏱ Bạn mất {Math.round(q.timeSpentMs / 1000)}s cho câu này — gấp {Math.round(q.timeSpentMs / Math.max(avgTime, 1))} lần trung bình. Cân nhắc luyện tốc độ.
                </p>
              )}

              {q.explanation && (
                <div className="mt-3">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [q.id]: !o[q.id] }))}
                    className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
                  >
                    {open[q.id] ? "▲ Ẩn giải thích" : "▼ Xem giải thích AI"}
                  </button>
                  {open[q.id] && (
                    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm leading-relaxed text-slate-800">
                      <TeX text={q.explanation} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
