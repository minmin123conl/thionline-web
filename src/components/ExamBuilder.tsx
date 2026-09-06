"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "./ui";
import { TeX } from "./Tex";
import { Mc4Editor, FillEditor, TrueFalseEditor } from "./AnswerEditor";
import { AssignExamForm } from "./AssignExamForm";
import { validateQuestion, type PublishIssue } from "@/lib/exam-validation";
import type { TemplateSectionSpec } from "@/lib/templates";

export type Answer = string | string[] | boolean[] | null;

export type BQ = {
  key: string;
  type: "MC4" | "FILL" | "TRUE_FALSE";
  stem: string;
  options: { id: string; text: string }[];
  answer: Answer;
  explanation: string;
  points: number;
  isTrial: boolean;
};

export type BS = {
  key: string;
  id?: string;
  code: string;
  title: string;
  minutes: number;
  questions: BQ[];
};

type ApiSection = { id: string; code: string; title: string; position: number; minutes: number };
type ApiQuestion = {
  id: string;
  sectionId: string;
  position: number;
  type: BQ["type"];
  stem: string;
  options: { id: string; text: string }[] | null;
  answer: Answer;
  explanation: string | null;
  points: number;
  isTrial: boolean;
};

export type ExamMeta = {
  id: string;
  title: string;
  description: string;
  status: string;
  templateCode: string | null;
  totalMinutes: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  attemptsAllowed: number;
  revealResult: string;
};

let keySeq = 0;
const nk = () => `n${++keySeq}`;

const OPTION_IDS = ["A", "B", "C", "D"];

function blankQuestion(type: BQ["type"]): BQ {
  const base = { key: nk(), stem: "", explanation: "", points: 1, isTrial: false };
  if (type === "MC4") return { ...base, type, options: OPTION_IDS.map((id) => ({ id, text: "" })), answer: null };
  if (type === "TRUE_FALSE") return { ...base, type, options: [], answer: [false, false, false, false] };
  return { ...base, type: "FILL", options: [], answer: [] };
}

function convertType(q: BQ, type: BQ["type"]): BQ {
  if (type === q.type) return q;
  if (type === "MC4") {
    const options = OPTION_IDS.map((id, i) => ({ id, text: q.options[i]?.text ?? "" }));
    return { ...q, type, options, answer: typeof q.answer === "string" ? q.answer : null };
  }
  if (type === "TRUE_FALSE") {
    const ok = Array.isArray(q.answer) && q.answer.length === 4 && q.answer.every((v) => typeof v === "boolean");
    return { ...q, type, options: [], answer: ok ? (q.answer as boolean[]) : [false, false, false, false] };
  }
  const accepted =
    typeof q.answer === "string"
      ? [q.answer]
      : Array.isArray(q.answer)
        ? (q.answer.filter((v): v is string => typeof v === "string") as string[])
        : [];
  return { ...q, type: "FILL", options: [], answer: accepted };
}

function fromApi(secs: ApiSection[], qs: ApiQuestion[]): BS[] {
  return secs.map((s, si) => ({
    key: `s-${si}`,
    id: s.id,
    code: s.code,
    title: s.title,
    minutes: s.minutes,
    questions: qs
      .filter((q) => q.sectionId === s.id)
      .sort((a, b) => a.position - b.position)
      .map((q, qi) => ({
        key: `q-${si}-${qi}`,
        type: q.type,
        stem: q.stem,
        options: q.options ?? [],
        answer: q.answer ?? null,
        explanation: q.explanation ?? "",
        points: q.points,
        isTrial: q.isTrial,
      })),
  }));
}

export function ExamBuilder({
  exam,
  template,
  initialSections,
  classes,
  assignments,
}: {
  exam: ExamMeta;
  template: { name: string; totalScore: number; specs: TemplateSectionSpec[] } | null;
  initialSections: BS[];
  classes: { id: string; name: string }[];
  assignments: { id: string; title: string; className: string }[];
}) {
  const router = useRouter();
  const isTemplate = Boolean(exam.templateCode);
  const [sections, setSections] = useState<BS[]>(initialSections);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [issues, setIssues] = useState<PublishIssue[]>([]);
  const [status, setStatus] = useState(exam.status);
  const [settings, setSettings] = useState({
    title: exam.title,
    description: exam.description,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    attemptsAllowed: exam.attemptsAllowed,
    revealResult: exam.revealResult,
    totalMinutes: exam.totalMinutes ?? 45,
  });
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(isTemplate ? [] : initialSections.map((s) => s.key))
  );
  const [openQ, setOpenQ] = useState<Set<string>>(() => new Set());
  const [newType, setNewType] = useState<Record<string, BQ["type"]>>({});

  const locked = status === "PUBLISHED";

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const invalid = useMemo(() => {
    const out: { sectionKey: string; qKey: string; label: string; errors: string[] }[] = [];
    sections.forEach((s) => {
      s.questions.forEach((q, qi) => {
        const errors = validateQuestion(q, s.title || s.code, qi);
        if (errors.length > 0) out.push({ sectionKey: s.key, qKey: q.key, label: `${s.title || s.code} — Câu ${qi + 1}`, errors });
      });
    });
    return out;
  }, [sections]);

  function mutate(fn: (draft: BS[]) => BS[]) {
    setSections((prev) => fn(prev.map((s) => ({ ...s, questions: s.questions.map((q) => ({ ...q })) }))));
    setDirty(true);
  }

  function updateSection(si: number, patch: Partial<BS>) {
    mutate((d) => {
      d[si] = { ...d[si], ...patch };
      return d;
    });
  }

  function updateQuestion(si: number, qi: number, patch: Partial<BQ>) {
    mutate((d) => {
      d[si].questions[qi] = { ...d[si].questions[qi], ...patch };
      return d;
    });
  }

  function addSection() {
    mutate((d) => [
      ...d,
      {
        key: nk(),
        code: `PART${d.length + 1}`,
        title: `Phần ${d.length + 1}`,
        minutes: 30,
        questions: [],
      },
    ]);
  }

  function removeSection(si: number) {
    if (!window.confirm(`Xóa “${sections[si].title}” cùng ${sections[si].questions.length} câu hỏi?`)) return;
    mutate((d) => d.filter((_, i) => i !== si));
  }

  function moveSection(si: number, dir: -1 | 1) {
    mutate((d) => {
      const j = si + dir;
      if (j < 0 || j >= d.length) return d;
      [d[si], d[j]] = [d[j], d[si]];
      return d;
    });
  }

  function addQuestion(si: number, type: BQ["type"]) {
    const q = blankQuestion(type);
    mutate((d) => {
      d[si].questions.push(q);
      return d;
    });
    setOpenQ((s) => new Set(s).add(q.key));
    setOpenSections((s) => new Set(s).add(sections[si].key));
  }

  function removeQuestion(si: number, qi: number) {
    mutate((d) => {
      d[si].questions.splice(qi, 1);
      return d;
    });
  }

  function moveQuestion(si: number, qi: number, dir: -1 | 1) {
    mutate((d) => {
      const j = qi + dir;
      const arr = d[si].questions;
      if (j < 0 || j >= arr.length) return d;
      [arr[qi], arr[j]] = [arr[j], arr[qi]];
      return d;
    });
  }

  function duplicateQuestion(si: number, qi: number) {
    mutate((d) => {
      const src = d[si].questions[qi];
      const copy: BQ = {
        ...src,
        key: nk(),
        options: src.options.map((o) => ({ ...o })),
        answer: Array.isArray(src.answer) ? [...(src.answer as (string | boolean)[])] : src.answer,
      } as BQ;
      d[si].questions.splice(qi + 1, 0, copy);
      return d;
    });
  }

  function payload() {
    return {
      sections: sections.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        minutes: s.minutes,
        questions: s.questions.map((q) => ({
          type: q.type,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          points: q.points,
          isTrial: q.isTrial,
        })),
      })),
    };
  }

  async function save(silent = false): Promise<boolean> {
    setBusy(true);
    if (!silent) setMsg(null);
    const res = await fetch(`/api/exams/${exam.id}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không lưu được nội dung đề" });
      return false;
    }
    setDirty(false);
    if (!silent) setMsg({ ok: true, text: `Đã lưu ${data.sections} phần · ${data.questions} câu` });
    return true;
  }

  async function saveSettings() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/exams/${exam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: settings.title,
        description: settings.description,
        shuffleQuestions: settings.shuffleQuestions,
        shuffleOptions: settings.shuffleOptions,
        attemptsAllowed: settings.attemptsAllowed,
        revealResult: settings.revealResult,
        totalMinutes: isTemplate ? undefined : settings.totalMinutes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không lưu được cài đặt" });
      return;
    }
    setMsg({ ok: true, text: "Đã lưu cài đặt đề" });
    router.refresh();
  }

  async function publish() {
    setBusy(true);
    setMsg(null);
    setIssues([]);
    if (dirty) {
      const ok = await save(true);
      if (!ok) {
        setBusy(false);
        setMsg({ ok: false, text: "Lưu nháp thất bại — chưa thể phát hành" });
        return;
      }
    }
    const res = await fetch(`/api/exams/${exam.id}/publish`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.ok) {
      setStatus("PUBLISHED");
      setMsg({ ok: true, text: "Đã phát hành đề — có thể giao cho lớp" });
      router.refresh();
      return;
    }
    if (Array.isArray(data.issues) && data.issues.length > 0) {
      setIssues(data.issues);
      setMsg({ ok: false, text: `Còn ${data.issues.length} lỗi cần sửa trước khi phát hành` });
    } else {
      setMsg({ ok: false, text: data.error ?? "Không phát hành được" });
    }
  }

  async function reload() {
    const res = await fetch(`/api/exams/${exam.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setSections(fromApi(data.sections as ApiSection[], data.questions as ApiQuestion[]));
    setDirty(false);
  }

  async function generateExplanations() {
    setBusy(true);
    setMsg(null);
    if (dirty && !(await save(true))) {
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/exams/${exam.id}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không sinh được giải thích" });
      return;
    }
    await reload();
    const errs = Array.isArray(data.errors) ? data.errors.length : 0;
    setMsg({
      ok: true,
      text:
        data.generated === 0
          ? "Không có câu nào thiếu giải thích (mỗi lần AI viết tối đa 20 câu)"
          : `AI đã viết ${data.generated} giải thích${errs ? ` · ${errs} câu bị lỗi, bấm lại để thử tiếp` : ""}`,
    });
  }

  function jumpToFirstInvalid() {
    const first = invalid[0];
    if (!first) return;
    setOpenSections((s) => new Set(s).add(first.sectionKey));
    setOpenQ((s) => new Set(s).add(first.qKey));
    setTimeout(() => {
      document.getElementById(`qb-${first.qKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function toggle(set: Set<string>, key: string, apply: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  }

  const totalQuestions = sections.reduce((a, s) => a + s.questions.length, 0);
  const scoredTotal = sections.reduce((a, s) => a + s.questions.filter((q) => !q.isTrial).reduce((b, q) => b + q.points, 0), 0);

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{exam.title}</h1>
        {locked ? <Badge color="green">Đã phát hành</Badge> : <Badge color="amber">Nháp</Badge>}
        {template && <Badge color="blue">{template.name}</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {sections.length} phần · {totalQuestions} câu hỏi · {scoredTotal} điểm
        {template ? ` · thang quy đổi ${template.totalScore}` : exam.totalMinutes ? ` · ${exam.totalMinutes} phút` : ""}
      </p>

      {template && (
        <Card className="mt-4 border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Đề theo khuôn {template.name}</p>
          <p className="mt-1">
            Cấu trúc phần và thời gian bị khóa theo khuôn thi thật. Bạn chỉ thêm/sửa câu hỏi. Mỗi phần phải đủ số câu tính
            điểm như khuôn yêu cầu trước khi phát hành.
          </p>
        </Card>
      )}

      {locked && (
        <Card className="mt-4 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Đề đã phát hành — nội dung bị khóa</p>
          <p className="mt-1">
            Học sinh có thể đang làm đề này nên câu hỏi không thể sửa nữa. Bạn vẫn có thể sinh thêm giải thích AI và giao
            đề cho lớp khác.
          </p>
        </Card>
      )}

      <div className="sticky top-0 z-20 -mx-4 mt-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <>
              <Button onClick={() => save()} disabled={busy || !dirty}>
                {busy ? "Đang xử lý..." : dirty ? "Lưu nháp •" : "Đã lưu"}
              </Button>
              <Button variant="secondary" onClick={publish} disabled={busy}>
                Phát hành đề
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={generateExplanations} disabled={busy}>
            Sinh giải thích AI
          </Button>
          {invalid.length > 0 && !locked && (
            <button type="button" onClick={jumpToFirstInvalid} className="text-sm text-rose-600 hover:underline">
              {invalid.length} câu chưa hợp lệ →
            </button>
          )}
          {msg && <span className={`ml-auto text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</span>}
        </div>
      </div>

      {issues.length > 0 && (
        <Card className="mt-4 border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">Chưa phát hành được — cần sửa:</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm text-rose-700">
            {issues.slice(0, 60).map((it, i) => (
              <li key={i}>• {it.message}</li>
            ))}
            {issues.length > 60 && <li>• ...và {issues.length - 60} lỗi khác</li>}
          </ul>
        </Card>
      )}

      <div className="mt-6 space-y-4">
        {sections.map((s, si) => {
          const spec = template?.specs.find((t) => t.code === s.code || t.title === s.title);
          const scored = s.questions.filter((q) => !q.isTrial).length;
          const trials = s.questions.length - scored;
          const targetOk = !spec || scored === spec.questions;
          const open = openSections.has(s.key);
          return (
            <Card key={s.key} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggle(openSections, s.key, setOpenSections)}
                  className="text-sm font-semibold text-slate-700"
                >
                  {open ? "▾" : "▸"} {s.title || s.code}
                </button>
                <Badge color="slate">{s.minutes} phút</Badge>
                <Badge color={targetOk ? "green" : "red"}>
                  {spec ? `${scored}/${spec.questions} câu` : `${s.questions.length} câu`}
                </Badge>
                {spec && spec.trials ? <Badge color="slate">thử nghiệm {trials}/{spec.trials}</Badge> : null}
                {spec && spec.types ? (
                  <span className="text-xs text-slate-500">
                    {Object.entries(spec.types)
                      .map(([t, n]) => `${t === "MC4" ? "4 lựa chọn" : t === "FILL" ? "điền đáp án" : "đúng/sai"}: ${n}`)
                      .join(" · ")}
                  </span>
                ) : null}
                {!locked && !isTemplate && (
                  <span className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => moveSection(si, -1)} disabled={si === 0}>↑</Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1}>↓</Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs text-rose-600" onClick={() => removeSection(si)}>Xóa phần</Button>
                  </span>
                )}
              </div>

              {open && (
                <div className="p-4">
                  {!locked && !isTemplate && (
                    <div className="mb-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                      <Field label="Tên phần">
                        <Input value={s.title} onChange={(e) => updateSection(si, { title: e.target.value })} />
                      </Field>
                      <Field label="Mã phần">
                        <Input value={s.code} onChange={(e) => updateSection(si, { code: e.target.value.toUpperCase() })} />
                      </Field>
                      <Field label="Thời gian (phút)">
                        <Input
                          type="number"
                          min={1}
                          max={600}
                          value={s.minutes}
                          onChange={(e) => updateSection(si, { minutes: Number(e.target.value) })}
                        />
                      </Field>
                    </div>
                  )}

                  {spec?.note && <p className="mb-3 text-xs text-slate-500">{spec.note}</p>}

                  <div className="space-y-1.5">
                    {s.questions.length === 0 && (
                      <p className="py-4 text-center text-sm text-slate-400">Phần này chưa có câu hỏi</p>
                    )}
                    {s.questions.map((q, qi) => {
                      const errs = validateQuestion(q, s.title || s.code, qi);
                      const expanded = openQ.has(q.key);
                      return (
                        <div
                          key={q.key}
                          id={`qb-${q.key}`}
                          className={`rounded-lg border ${expanded ? "border-blue-300 bg-white" : "border-slate-200 bg-white"}`}
                        >
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="w-7 shrink-0 text-xs font-semibold text-slate-400">{qi + 1}</span>
                            <Badge color={q.type === "MC4" ? "blue" : q.type === "FILL" ? "amber" : "slate"}>
                              {q.type === "MC4" ? "4 lựa chọn" : q.type === "FILL" ? "Điền" : "Đúng/Sai"}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => toggle(openQ, q.key, setOpenQ)}
                              className="min-w-0 flex-1 truncate text-left text-sm text-slate-700 hover:text-blue-700"
                            >
                              {q.stem.trim() ? <TeX text={q.stem.slice(0, 160)} /> : <span className="italic text-slate-400">(chưa có đề bài)</span>}
                            </button>
                            {q.isTrial && <Badge color="slate">Thử nghiệm</Badge>}
                            {errs.length > 0 && <Badge color="red">{errs.length} lỗi</Badge>}
                            {!locked && (
                              <span className="flex shrink-0 items-center gap-1">
                                <Button variant="ghost" className="px-1.5 py-0.5 text-xs" onClick={() => moveQuestion(si, qi, -1)} disabled={qi === 0}>↑</Button>
                                <Button variant="ghost" className="px-1.5 py-0.5 text-xs" onClick={() => moveQuestion(si, qi, 1)} disabled={qi === s.questions.length - 1}>↓</Button>
                                <Button variant="ghost" className="px-1.5 py-0.5 text-xs" onClick={() => duplicateQuestion(si, qi)}>Nhân bản</Button>
                                <Button variant="ghost" className="px-1.5 py-0.5 text-xs text-rose-600" onClick={() => removeQuestion(si, qi)}>Xóa</Button>
                              </span>
                            )}
                          </div>

                          {expanded && (
                            <div className="space-y-3 border-t border-slate-100 p-3">
                              {errs.length > 0 && (
                                <ul className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                                  {errs.map((e, i) => (
                                    <li key={i}>• {e}</li>
                                  ))}
                                </ul>
                              )}
                              {!locked && (
                                <div className="flex flex-wrap items-end gap-2">
                                  <div className="w-44">
                                    <Field label="Loại câu">
                                      <Select value={q.type} onChange={(e) => updateQuestion(si, qi, convertType(q, e.target.value as BQ["type"]))}>
                                        <option value="MC4">4 lựa chọn (A–D)</option>
                                        <option value="FILL">Điền đáp án</option>
                                        <option value="TRUE_FALSE">Đúng/Sai 4 ý</option>
                                      </Select>
                                    </Field>
                                  </div>
                                  <div className="w-24">
                                    <Field label="Điểm">
                                      <Input
                                        type="number"
                                        step="0.25"
                                        min={0.25}
                                        value={q.points}
                                        onChange={(e) => updateQuestion(si, qi, { points: Number(e.target.value) })}
                                      />
                                    </Field>
                                  </div>
                                  {spec?.trials ? (
                                    <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
                                      <input
                                        type="checkbox"
                                        checked={q.isTrial}
                                        onChange={(e) => updateQuestion(si, qi, { isTrial: e.target.checked })}
                                      />
                                      Câu thử nghiệm (không tính điểm, ẩn với học sinh)
                                    </label>
                                  ) : null}
                                </div>
                              )}

                              <Field label="Đề bài" hint="Công thức viết dạng LaTeX: $x^2+1$ (inline) hoặc $$...$$ (xuống dòng)">
                                <Textarea
                                  rows={4}
                                  readOnly={locked}
                                  value={q.stem}
                                  onChange={(e) => updateQuestion(si, qi, { stem: e.target.value })}
                                  placeholder="Nội dung câu hỏi..."
                                />
                              </Field>
                              {q.stem.trim() && (
                                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Học sinh sẽ thấy</span>
                                  <TeX text={q.stem} />
                                </div>
                              )}

                              {q.type === "MC4" && (
                                <Mc4Editor
                                  name={`ans-${q.key}`}
                                  options={q.options}
                                  answer={q.answer}
                                  readOnly={locked}
                                  onChange={(p) => updateQuestion(si, qi, p)}
                                />
                              )}

                              {q.type === "FILL" && (
                                <FillEditor answer={q.answer} readOnly={locked} onChange={(p) => updateQuestion(si, qi, p)} />
                              )}

                              {q.type === "TRUE_FALSE" && (
                                <TrueFalseEditor
                                  options={q.options}
                                  answer={q.answer}
                                  readOnly={locked}
                                  onChange={(p) => updateQuestion(si, qi, p)}
                                />
                              )}

                              <Field label="Giải thích (hiện cho học sinh sau khi nộp)">
                                <Textarea
                                  rows={3}
                                  readOnly={locked}
                                  value={q.explanation}
                                  onChange={(e) => updateQuestion(si, qi, { explanation: e.target.value })}
                                  placeholder="Các bước suy luận dẫn tới đáp án..."
                                />
                              </Field>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!locked && (
                    <div className="mt-3 flex items-center gap-2">
                      <Select
                        className="w-48"
                        value={newType[s.key] ?? "MC4"}
                        onChange={(e) => setNewType((p) => ({ ...p, [s.key]: e.target.value as BQ["type"] }))}
                      >
                        <option value="MC4">4 lựa chọn (A–D)</option>
                        <option value="FILL">Điền đáp án</option>
                        <option value="TRUE_FALSE">Đúng/Sai 4 ý</option>
                      </Select>
                      <Button variant="secondary" onClick={() => addQuestion(si, newType[s.key] ?? "MC4")}>
                        + Thêm câu hỏi
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {!locked && !isTemplate && (
          <Button variant="secondary" onClick={addSection}>+ Thêm phần</Button>
        )}
      </div>

      {!locked && (
        <Card className="mt-8 p-4">
          <p className="text-sm font-semibold">Cài đặt đề</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Tên đề">
              <Input value={settings.title} onChange={(e) => setSettings((p) => ({ ...p, title: e.target.value }))} />
            </Field>
            {!isTemplate && (
              <Field label="Tổng thời gian (phút)" hint="Nếu có nhiều phần, tổng thời gian là tổng thời gian các phần">
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={settings.totalMinutes}
                  onChange={(e) => setSettings((p) => ({ ...p, totalMinutes: Number(e.target.value) }))}
                />
              </Field>
            )}
            <Field label="Số lượt làm (phòng thi thực chiến)" hint="Đề giao cho lớp thì số lượt do lần giao quyết định">
              <Input
                type="number"
                min={1}
                max={20}
                value={settings.attemptsAllowed}
                onChange={(e) => setSettings((p) => ({ ...p, attemptsAllowed: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Hiện kết quả cho học sinh">
              <Select value={settings.revealResult} onChange={(e) => setSettings((p) => ({ ...p, revealResult: e.target.value }))}>
                <option value="IMMEDIATE">Ngay sau khi nộp</option>
                <option value="AFTER_CLOSE">Sau khi hết hạn nộp</option>
                <option value="MANUAL">Không tự động hiện</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.shuffleQuestions}
                disabled={isTemplate}
                onChange={(e) => setSettings((p) => ({ ...p, shuffleQuestions: e.target.checked }))}
              />
              Xáo thứ tự câu hỏi mỗi học sinh
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.shuffleOptions}
                disabled={isTemplate}
                onChange={(e) => setSettings((p) => ({ ...p, shuffleOptions: e.target.checked }))}
              />
              Xáo thứ tự lựa chọn A–D
            </label>
          </div>
          {isTemplate && (
            <p className="mt-2 text-xs text-slate-500">
              Đề theo khuôn thi thật luôn giữ nguyên thứ tự câu và lựa chọn để giống đề chính thức.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={saveSettings} disabled={busy}>Lưu cài đặt</Button>
          </div>
        </Card>
      )}

      {locked && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm font-semibold">Giao đề cho lớp</p>
            <div className="mt-3">
              <AssignExamForm examId={exam.id} classes={classes} />
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-semibold">Đã giao</p>
            {assignments.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Chưa giao cho lớp nào.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span>
                      <span className="font-medium">{a.title}</span>
                      <span className="ml-2 text-xs text-slate-500">{a.className}</span>
                    </span>
                    <a href={`/giao-vien/bao-cao/${a.id}`} className="text-xs text-blue-700 hover:underline">Báo cáo →</a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
