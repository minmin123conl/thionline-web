"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TeX } from "./Tex";

type ClientQuestion = {
  id: string;
  position: number;
  type: "MC4" | "FILL" | "TRUE_FALSE";
  stem: string;
  options: { id: string; text: string }[];
  points: number;
  subCount?: number;
};

type StateSection = {
  attemptSectionId: string;
  sectionId: string;
  code: string;
  title: string;
  position: number;
  startedAt: string | null;
  deadlineAt: string | null;
  lockedAt: string | null;
  expired: boolean;
  questions: ClientQuestion[];
};

type AttemptState = {
  attempt: {
    id: string;
    status: string;
    mode: "EXAM" | "MOCK_FULL" | "PRACTICE";
    timingMode: "PER_SECTION" | "GLOBAL";
    startedAt: string;
    submittedAt: string | null;
    globalDeadlineAt: string | null;
  };
  exam: { id: string; title: string; templateCode: string | null };
  sections: StateSection[];
  answers: Record<string, { answer: unknown; clientSeq: number; savedAt: string }>;
  serverNow: string;
};

type PendingSave = { questionId: string; clientSeq: number; answer: unknown; timeSpentMs: number };

const LS_KEY = (id: string) => `exam-offline-${id}`;
const LS_FLAGS = (id: string) => `exam-flags-${id}`;

function fmtClock(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ExamPlayer({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [state, setState] = useState<AttemptState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [offset, setOffset] = useState(0); // serverTime - clientTime
  const [now, setNow] = useState(() => Date.now());

  const [sectionIdx, setSectionIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, unknown>>({});
  const [seqMap, setSeqMap] = useState<Record<string, number>>({});
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [savedTick, setSavedTick] = useState<Record<string, number>>({}); // qid -> timestamp lần lưu thành công
  const [pending, setPending] = useState<PendingSave[]>([]);
  const [online, setOnline] = useState(true);
  const [transition, setTransition] = useState<{ from: string; to?: string; autoSec: number } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [warn60, setWarn60] = useState<string | null>(null);
  const [mobileGate, setMobileGate] = useState(false);
  const [mobileAck, setMobileAck] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const timeOnQ = useRef<Record<string, number>>({});
  const qEnterTime = useRef<number>(Date.now());
  const fillDraft = useRef<Record<string, string>>({});
  const fillTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ===== load state =====
  const load = useCallback(async () => {
    const res = await fetch(`/api/attempts/${attemptId}`, { cache: "no-store" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setLoadError(d.error ?? "Không tải được đề thi");
      return null;
    }
    const s: AttemptState = await res.json();
    setOffset(new Date(s.serverNow).getTime() - Date.now());
    setState(s);
    if (s.attempt.status !== "ACTIVE") {
      router.replace(`/ket-qua/${attemptId}`);
      return null;
    }
    setSeqMap(Object.fromEntries(Object.entries(s.answers).map(([k, v]) => [k, v.clientSeq])));
    setLocalAnswers(Object.fromEntries(Object.entries(s.answers).map(([k, v]) => [k, v.answer])));
    const firstOpen = s.sections.findIndex((sec) => !sec.expired);
    setSectionIdx(firstOpen >= 0 ? firstOpen : 0);
    return s;
  }, [attemptId, router]);

  useEffect(() => {
    load();
    // khôi phục flags + hàng đợi offline
    try {
      const f = localStorage.getItem(LS_FLAGS(attemptId));
      if (f) setFlags(new Set(JSON.parse(f)));
      const p = localStorage.getItem(LS_KEY(attemptId));
      if (p) setPending(JSON.parse(p));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 500);
    return () => clearInterval(t);
  }, [offset]);

  // ===== mobile gate cho chế độ thi nghiêm túc =====
  useEffect(() => {
    if (!state) return;
    if (state.attempt.mode === "PRACTICE") return;
    const small = window.innerWidth < 900 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (small) setMobileGate(true);
  }, [state]);

  // ===== online/offline + sync hàng đợi =====
  const syncPending = useCallback(
    async (list: PendingSave[]) => {
      if (list.length === 0) return [];
      const stillPending: PendingSave[] = [];
      for (const p of list) {
        try {
          const res = await fetch(`/api/attempts/${attemptId}/answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          });
          if (res.ok) {
            setSavedTick((t) => ({ ...t, [p.questionId]: Date.now() }));
            setSeqMap((m) => ({ ...m, [p.questionId]: Math.max(m[p.questionId] ?? 0, p.clientSeq) }));
          } else if (res.status === 409) {
            // hết giờ/khóa phần/đã nộp — bỏ qua, server là nguồn chân lý
          } else {
            stillPending.push(p);
          }
        } catch {
          stillPending.push(p);
        }
      }
      return stillPending;
    },
    [attemptId]
  );

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      const rest = await syncPending(pending);
      setPending(rest);
      try {
        if (rest.length === 0) localStorage.removeItem(LS_KEY(attemptId));
        else localStorage.setItem(LS_KEY(attemptId), JSON.stringify(rest));
      } catch {}
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setOnline(navigator.onLine);
    const retry = setInterval(() => {
      if (navigator.onLine) goOnline();
    }, 15000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, syncPending]);

  // ===== đếm thời gian trên câu hiện tại =====
  const currentSection = state?.sections[sectionIdx];
  const currentQ = currentSection?.questions[qIdx];
  useEffect(() => {
    const spent = timeOnQ.current;
    const qid = currentQ?.id;
    qEnterTime.current = Date.now();
    return () => {
      if (qid) spent[qid] = (spent[qid] ?? 0) + (Date.now() - qEnterTime.current);
    };
  }, [currentQ?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== phát hiện rời tab (tín hiệu chống gian lận mức nhẹ) =====
  useEffect(() => {
    if (!state || state.attempt.mode === "PRACTICE") return;
    const onVis = () => {
      if (document.hidden) setTabSwitches((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state]);

  // ===== lưu đáp án =====
  const pushAnswer = useCallback(
    (questionId: string, answer: unknown) => {
      const seq = (seqMap[questionId] ?? 0) + 1;
      const timeSpentMs = Math.min(3_600_000, timeOnQ.current[questionId] ?? 0);
      setSeqMap((m) => ({ ...m, [questionId]: seq }));
      setLocalAnswers((a) => ({ ...a, [questionId]: answer }));
      const item: PendingSave = { questionId, clientSeq: seq, answer, timeSpentMs };
      const nextQueue = [...pending, item];
      setPending(nextQueue);
      try {
        localStorage.setItem(LS_KEY(attemptId), JSON.stringify(nextQueue));
      } catch {}
      syncPending(nextQueue).then((rest) => {
        setPending(rest);
        try {
          if (rest.length === 0) localStorage.removeItem(LS_KEY(attemptId));
          else localStorage.setItem(LS_KEY(attemptId), JSON.stringify(rest));
        } catch {}
      });
    },
    [attemptId, pending, seqMap, syncPending]
  );

  // ===== đồng hồ & hết giờ =====
  const activeDeadline = useMemo(() => {
    if (!state || state.attempt.mode === "PRACTICE") return null;
    if (state.attempt.timingMode === "GLOBAL") {
      return state.attempt.globalDeadlineAt ? new Date(state.attempt.globalDeadlineAt).getTime() : null;
    }
    const sec = state.sections[sectionIdx];
    return sec?.deadlineAt ? new Date(sec.deadlineAt).getTime() : null;
  }, [state, sectionIdx]);

  const remaining = activeDeadline !== null ? activeDeadline - now : null;

  useEffect(() => {
    if (remaining === null || remaining > 60_000 || remaining <= 0) return;
    if (!warn60) {
      const title = state?.attempt.timingMode === "GLOBAL" ? "toàn bài thi" : state?.sections[sectionIdx]?.title ?? "phần này";
      setWarn60(title);
    }
  }, [remaining, warn60, state, sectionIdx]);

  const submit = useCallback(
    async (auto = false) => {
      try {
        await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
      } catch {}
      router.replace(`/ket-qua/${attemptId}${auto ? "?auto=1" : ""}`);
    },
    [attemptId, router]
  );

  const advance = useCallback(async () => {
    const res = await fetch(`/api/attempts/${attemptId}/advance`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.finished || !res.ok) {
      await submit(true);
      return;
    }
    setTransition(null);
    setWarn60(null);
    const s = await load();
    if (s) {
      const idx = s.sections.findIndex((sec) => !sec.expired);
      setSectionIdx(idx >= 0 ? idx : 0);
      setQIdx(0);
    }
  }, [attemptId, load, submit]);

  useEffect(() => {
    if (!state || remaining === null || remaining > 0) return;
    if (state.attempt.mode === "PRACTICE") return;
    if (state.attempt.timingMode === "GLOBAL") {
      submit(true);
      return;
    }
    // PER_SECTION: hết giờ phần → modal chuyển phần (tự chuyển sau 10s kể cả không bấm)
    const sec = state.sections[sectionIdx];
    const nextSec = state.sections.find((s) => s.position === (sec?.position ?? 0) + 1);
    if (!nextSec) {
      submit(true);
      return;
    }
    setTransition((t) => t ?? { from: sec?.title ?? "", to: nextSec.title, autoSec: 10 });
  }, [remaining, state, sectionIdx, submit]);

  useEffect(() => {
    if (!transition || transition.autoSec <= 0) return;
    const t = setTimeout(() => {
      if (transition.autoSec <= 1) advance();
      else setTransition({ ...transition, autoSec: transition.autoSec - 1 });
    }, 1000);
    return () => clearTimeout(t);
  }, [transition, advance]);

  // ===== cờ xem lại =====
  const toggleFlag = (qid: string) => {
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      try {
        localStorage.setItem(LS_FLAGS(attemptId), JSON.stringify([...n]));
      } catch {}
      return n;
    });
  };

  // ===== render =====
  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <p className="font-semibold text-rose-700">{loadError}</p>
          <button onClick={() => router.push("/hoc-sinh")} className="mt-4 text-sm text-blue-700 hover:underline">← Về trang chủ</button>
        </div>
      </div>
    );
  }
  if (!state || !currentSection) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
      </div>
    );
  }

  const isMock = state.attempt.mode === "MOCK_FULL";
  const isPractice = state.attempt.mode === "PRACTICE";
  const isGlobal = state.attempt.timingMode === "GLOBAL";
  const openSections = isGlobal || isPractice ? state.sections : state.sections.filter((s) => !s.expired || s.position === currentSection.position);
  const shownSections = isGlobal || isPractice ? state.sections : [currentSection];
  const sec = shownSections[isGlobal || isPractice ? sectionIdx : 0] ?? currentSection;
  const qs = sec.questions;
  const q = qs[Math.min(qIdx, qs.length - 1)];
  const answeredCount = qs.filter((x) => localAnswers[x.id] !== undefined && localAnswers[x.id] !== null && localAnswers[x.id] !== "").length;
  const totalParts = state.sections.length;

  const timerColor =
    remaining === null ? "" : remaining < 60_000 ? "text-rose-600 animate-pulse" : remaining < 300_000 ? "text-rose-600" : remaining < 600_000 ? "text-amber-600" : "text-slate-800";

  if (mobileGate && !mobileAck && !isPractice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/60 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold">Nên làm bài trên máy tính</h2>
          <p className="mt-2 text-sm text-slate-600">
            Kỳ thi thật làm trên máy tính với màn hình lớn. Làm trên điện thoại sẽ khó thao tác và không phản ánh đúng điều kiện thi — kết quả luyện tập có thể kém chính xác.
          </p>
          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={mobileAck} onChange={(e) => setMobileAck(e.target.checked)} className="mt-0.5" />
            Tôi hiểu đây là bản mô phỏng và muốn tiếp tục trên thiết bị này
          </label>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setMobileAck(true)}
              disabled={!mobileAck}
              className="flex-1 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
            >
              Vẫn tiếp tục
            </button>
            <button onClick={() => router.push("/hoc-sinh")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600">
              Quay lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Header */}
      <header className={`sticky top-0 z-30 border-b bg-white ${isMock ? "border-indigo-200" : "border-slate-200"}`}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className={`truncate text-xs font-semibold uppercase tracking-wide ${isMock ? "text-indigo-600" : "text-slate-400"}`}>
              {isMock ? "Phòng thi thực chiến" : isPractice ? "Luyện tập" : "Bài kiểm tra"}
              {!isPractice && !isGlobal && totalParts > 1 && ` · Phần ${sec.position}/${totalParts}`}
            </p>
            <p className="truncate text-sm font-medium text-slate-800">{sec.title}</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {!online && (
              <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 sm:flex">
                ⚠ Mất kết nối{pending.length > 0 && ` · ${pending.length} chưa lưu`} — đồng hồ vẫn chạy
              </span>
            )}
            {online && pending.length > 0 && <span className="text-xs text-slate-400">Đang lưu {pending.length}...</span>}
            {!isPractice && remaining !== null && (
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-400">{isGlobal ? "Thời gian còn lại" : "Phần này còn"}</p>
                <p className={`font-mono text-2xl font-bold tabular-nums ${timerColor}`}>{fmtClock(remaining)}</p>
              </div>
            )}
            {isPractice && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Không giới hạn thời gian</span>}
          </div>
        </div>
        {tabSwitches > 0 && !isPractice && (
          <div className="bg-rose-50 px-4 py-1 text-center text-xs text-rose-700">
            Bạn đã rời khỏi trang {tabSwitches} lần. Hành vi này được ghi nhận.
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-4 py-4">
        {/* Vùng câu hỏi */}
        <main className="min-w-0 flex-1">
          {/* Tabs phần (GLOBAL/PRACTICE) */}
          {(isGlobal || isPractice) && state.sections.length > 1 && (
            <div className="mb-3 flex gap-1.5 overflow-x-auto">
              {state.sections.map((s, i) => {
                const done = s.questions.filter((x) => localAnswers[x.id] != null && localAnswers[x.id] !== "").length;
                return (
                  <button
                    key={s.sectionId}
                    onClick={() => { setSectionIdx(i); setQIdx(0); }}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                      i === sectionIdx ? "bg-blue-700 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {s.title.replace(/^Phần \d+ — /, "")} ({done}/{s.questions.length})
                  </button>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">
                Câu {qIdx + 1}/{qs.length}
                {q.type === "FILL" && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800">Điền đáp án</span>}
                {q.type === "TRUE_FALSE" && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">Đúng / Sai</span>}
              </p>
              <button
                onClick={() => toggleFlag(q.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  flags.has(q.id) ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {flags.has(q.id) ? "⚑ Đã đánh dấu" : "⚐ Đánh dấu xem lại"}
              </button>
            </div>

            <div className="text-[15px] leading-relaxed text-slate-900">
              <TeX text={q.stem} />
            </div>

            {q.type === "MC4" && (
              <div className="mt-4 space-y-2">
                {q.options.map((o) => {
                  const selected = localAnswers[q.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => pushAnswer(q.id, o.id)}
                      className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left text-[15px] transition-colors ${
                        selected ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-500"}`}>
                        {o.id}
                      </span>
                      <span className="min-w-0 flex-1"><TeX text={o.text} /></span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "FILL" && (
              <div className="mt-4">
                <input
                  defaultValue={typeof localAnswers[q.id] === "string" ? (localAnswers[q.id] as string) : ""}
                  ref={(el) => {
                    if (el && fillDraft.current[q.id] === undefined) fillDraft.current[q.id] = el.value;
                  }}
                  onChange={(e) => {
                    fillDraft.current[q.id] = e.target.value;
                    clearTimeout(fillTimer.current[q.id]);
                    fillTimer.current[q.id] = setTimeout(() => pushAnswer(q.id, e.target.value), 700);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      clearTimeout(fillTimer.current[q.id]);
                      pushAnswer(q.id, (e.target as HTMLInputElement).value);
                    }
                  }}
                  placeholder="Nhập đáp án của bạn..."
                  className="w-full max-w-md rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoComplete="off"
                />
                <p className="mt-1.5 text-xs text-slate-400">Tự động lưu khi ngừng gõ hoặc bấm Enter.</p>
              </div>
            )}

            {q.type === "TRUE_FALSE" && (
              <div className="mt-4 space-y-2">
                {["a", "b", "c", "d"].map((label, i) => {
                  const cur = Array.isArray(localAnswers[q.id]) ? [...(localAnswers[q.id] as boolean[])] : [null, null, null, null];
                  const set = (v: boolean) => {
                    cur[i] = v;
                    pushAnswer(q.id, cur);
                  };
                  return (
                    <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
                      <span className="text-[15px]">
                        <b className="mr-1.5 text-slate-500">{label})</b>
                        <TeX text={q.options[i]?.text ?? ""} />
                      </span>
                      <span className="flex gap-1.5">
                        <button onClick={() => set(true)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${cur[i] === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>Đúng</button>
                        <button onClick={() => set(false)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${cur[i] === false ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>Sai</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {savedTick[q.id] && (
              <p className="mt-3 text-xs text-emerald-600 opacity-80">✓ Đã lưu câu trả lời</p>
            )}
          </div>

          {/* Điều hướng câu */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => setQIdx((i) => Math.max(0, i - 1))}
              disabled={qIdx === 0}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              ← Trước
            </button>
            {qIdx < qs.length - 1 ? (
              <button
                onClick={() => setQIdx((i) => Math.min(qs.length - 1, i + 1))}
                className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800"
              >
                Tiếp →
              </button>
            ) : !isGlobal && !isPractice && state.sections[sectionIdx + 1] ? (
              <button
                onClick={() => {
                  setSectionIdx((i) => i + 1);
                  setQIdx(0);
                }}
                className="rounded-lg bg-indigo-700 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-800"
              >
                Phần tiếp theo →
              </button>
            ) : (
              <button onClick={() => setConfirmSubmit(true)} className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800">
                Nộp bài
              </button>
            )}
          </div>
          {!isPractice && !isGlobal && !state.sections[sectionIdx + 1] && qIdx < qs.length - 1 && (
            <button onClick={() => setConfirmSubmit(true)} className="mt-2 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
              Nộp bài (hoàn tất sớm)
            </button>
          )}
          {!isPractice && !isGlobal && state.sections[sectionIdx + 1] && (
            <button
              onClick={() => setTransition({ from: sec.title, to: state.sections[sectionIdx + 1].title, autoSec: 0 })}
              className="mt-2 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-800 hover:bg-indigo-100"
            >
              Nộp phần này sớm và chuyển sang phần kế tiếp →
            </button>
          )}
        </main>

        {/* Palette câu hỏi */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Bảng câu hỏi · {answeredCount}/{qs.length} đã làm</p>
            <div className="grid grid-cols-6 gap-1.5">
              {qs.map((x, i) => {
                const answered = localAnswers[x.id] != null && localAnswers[x.id] !== "";
                return (
                  <button
                    key={x.id}
                    onClick={() => setQIdx(i)}
                    className={`relative h-8 rounded-md text-xs font-semibold transition-colors ${
                      i === qIdx ? "ring-2 ring-slate-800 ring-offset-1" : ""
                    } ${
                      answered ? "bg-blue-700 text-white hover:bg-blue-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {i + 1}
                    {flags.has(x.id) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 text-[11px] text-slate-500">
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-blue-700" />Đã trả lời</p>
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" />Chưa trả lời</p>
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />Đánh dấu xem lại</p>
            </div>
            <button
              onClick={() => setConfirmSubmit(true)}
              className="mt-3 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Nộp bài
            </button>
            {openSections.length < state.sections.length && !isGlobal && !isPractice && (
              <p className="mt-2 text-[11px] text-slate-400">Các phần đã qua bị khóa theo quy chế thi.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Palette cho mobile */}
      <div className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto">
          {qs.map((x, i) => {
            const answered = localAnswers[x.id] != null && localAnswers[x.id] !== "";
            return (
              <button
                key={x.id}
                onClick={() => setQIdx(i)}
                className={`h-7 w-7 shrink-0 rounded-md text-xs font-semibold ${i === qIdx ? "ring-2 ring-slate-800" : ""} ${answered ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Modal cảnh báo 60 giây */}
      {warn60 && remaining !== null && remaining > 0 && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-4xl font-bold text-rose-600">{fmtClock(remaining)}</p>
            <p className="mt-2 text-sm font-medium text-slate-700">Sắp hết thời gian {warn60}!</p>
            <p className="mt-1 text-xs text-slate-500">{answeredCount}/{qs.length} câu đã trả lời trong phần này.</p>
            <button onClick={() => setWarn60(null)} className="mt-4 w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white">
              Tiếp tục làm bài
            </button>
          </div>
        </div>
      )}

      {/* Modal chuyển phần */}
      {transition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {transition.autoSec > 0 ? `Hết thời gian: ${transition.from}` : "Chuyển phần"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {transition.from} đã bị <b>khóa vĩnh viễn</b> — bạn không thể quay lại (đúng quy chế thi trên máy tính).
            </p>
            {transition.to && (
              <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900">
                Tiếp theo: {transition.to}
              </p>
            )}
            {transition.autoSec > 0 && <p className="mt-2 text-xs text-slate-400">Tự động chuyển sau {transition.autoSec}s...</p>}
            <button onClick={advance} className="mt-4 w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800">
              Vào phần tiếp theo ngay
            </button>
          </div>
        </div>
      )}

      {/* Modal xác nhận nộp bài */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">Nộp bài?</h2>
            {state.sections.filter((s) => !s.expired).length > 1 ? (
              <p className="mt-2 text-sm text-slate-600">
                Bạn đang ở {sec.title}. Nộp bài sẽ kết thúc toàn bộ bài thi và không thể làm tiếp.
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-600">
              Phần hiện tại: <b>{answeredCount}/{qs.length}</b> câu đã trả lời
              {qs.length - answeredCount > 0 && <span className="text-rose-600"> · {qs.length - answeredCount} câu chưa làm sẽ tính 0 điểm</span>}
            </p>
            {flags.size > 0 && <p className="mt-1 text-xs text-amber-700">Bạn còn {flags.size} câu đánh dấu xem lại chưa kiểm tra.</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmSubmit(false)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                Xem lại đã
              </button>
              <button onClick={() => submit(false)} className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                Nộp bài
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
