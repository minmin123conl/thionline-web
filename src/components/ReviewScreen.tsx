"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "./ui";
import { TeX } from "./Tex";
import {
  AnswerSummary,
  FillEditor,
  Mc4Editor,
  TrueFalseEditor,
  type Answer,
  type Opt,
} from "./AnswerEditor";
import type { ExtractedItem, ExtractedQuestion } from "@/lib/types";

export type DocMeta = {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  error: string;
  extractCursor: number;
  extractedText: string;
  engine: string;
  totalPages: number;
  ocrPagesDone: number;
  aiCalls: number;
  parsedDone: boolean;
  parsedText: string;
};

const MAX_GEN_CALLS = 5; // phải khớp với cap trong /api/.../gen-answers

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chưa duyệt",
  APPROVED: "Đã duyệt",
  EDITED: "Đã sửa",
  REJECTED: "Đã loại",
};

function confColor(c: number): "green" | "amber" | "red" {
  if (c >= 0.9) return "green";
  if (c >= 0.7) return "amber";
  return "red";
}

/** Bản chuẩn hóa khoảng trắng + ánh xạ vị trí về văn bản gốc, để tìm đoạn AI trích dẫn dù lệch dấu cách */
function buildNormalized(text: string) {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (norm.length > 0 && norm[norm.length - 1] !== " ") {
        norm += " ";
        map.push(i);
      }
    } else {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map };
}

function findRange(text: string, normalized: { norm: string; map: number[] }, needle: string) {
  const q = needle.trim();
  if (!q) return null;
  const direct = text.indexOf(q);
  if (direct >= 0) return { start: direct, end: direct + q.length };
  const nq = q.replace(/\s+/g, " ");
  const at = normalized.norm.indexOf(nq);
  if (at >= 0) {
    const start = normalized.map[at] ?? 0;
    const endIdx = normalized.map[at + nq.length - 1] ?? start;
    return { start, end: endIdx + 1 };
  }
  const firstLine = q.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (firstLine.length >= 8) {
    const fallback = text.indexOf(firstLine);
    if (fallback >= 0) return { start: fallback, end: fallback + firstLine.length };
  }
  return null;
}

export function ReviewScreen({
  doc,
  initialItems,
  aiConfigured,
}: {
  doc: DocMeta;
  initialItems: ExtractedItem[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ExtractedItem[]>(initialItems);
  const [docStatus, setDocStatus] = useState(doc.status);
  const [docError, setDocError] = useState(doc.error);
  const [cursor, setCursor] = useState(doc.extractCursor);
  const [extracting, setExtracting] = useState(false);
  const [extractedCount, setExtractedCount] = useState(0);
  const [engine, setEngine] = useState<"OFFLINE" | "AI">(doc.engine === "AI" ? "AI" : "OFFLINE");
  const [pagesDone, setPagesDone] = useState(doc.ocrPagesDone);
  const [totalPages, setTotalPages] = useState(doc.totalPages);
  const [aiCalls, setAiCalls] = useState(doc.aiCalls);
  const [genBusy, setGenBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "OK" | "REJECTED">("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractedQuestion | null>(null);
  const [focus, setFocus] = useState<{ needle: string; token: number } | null>(null);
  const [query, setQuery] = useState("");
  const [qAt, setQAt] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importTitle, setImportTitle] = useState(doc.fileName.replace(/\.(docx|pdf)$/i, "").slice(0, 180));
  const [importMinutes, setImportMinutes] = useState(45);
  const [importing, setImporting] = useState(false);
  const markRef = useRef<HTMLElement | null>(null);

  // PDF scan dùng parsedText (tích lũy OCR); docx/PDF có chữ dùng extractedText
  const sourceText = doc.fileType === "pdf_scan" ? doc.parsedText : doc.extractedText;
  const total = sourceText.length;
  const normalized = useMemo(() => buildNormalized(sourceText), [sourceText]);

  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, EDITED: 0, REJECTED: 0 };
    for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    if (filter === "ALL") return items;
    if (filter === "PENDING") return items.filter((i) => i.status === "PENDING");
    if (filter === "OK") return items.filter((i) => i.status === "APPROVED" || i.status === "EDITED");
    return items.filter((i) => i.status === "REJECTED");
  }, [items, filter]);

  const queryMatches = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [] as { start: number; end: number }[];
    const out: { start: number; end: number }[] = [];
    const hay = sourceText.toLowerCase();
    const needle = q.toLowerCase();
    let at = hay.indexOf(needle);
    while (at >= 0 && out.length < 400) {
      out.push({ start: at, end: at + needle.length });
      at = hay.indexOf(needle, at + needle.length);
    }
    return out;
  }, [query, sourceText]);

  const activeRange = useMemo(() => {
    if (focus) return findRange(sourceText, normalized, focus.needle);
    return queryMatches[Math.min(qAt, Math.max(queryMatches.length - 1, 0))] ?? null;
  }, [focus, normalized, sourceText, queryMatches, qAt]);

  useEffect(() => {
    if (!activeRange) return;
    markRef.current?.scrollIntoView({ block: "center" });
  }, [activeRange, focus?.token, qAt]);

  useEffect(() => {
    setQAt(0);
  }, [query]);

  async function refresh() {
    const res = await fetch(`/api/documents/${doc.id}/extract`);
    if (!res.ok) return;
    const data = await res.json();
    setItems((data.items as ExtractedItem[]).sort((a, b) => a.seq - b.seq));
    setDocStatus(data.document.status);
    setDocError(data.document.error ?? "");
    setCursor(data.document.extractCursor ?? 0);
    setAiCalls(data.document.aiCalls ?? aiCalls);
  }

  /** Tiến hành đọc file theo engine đã chọn, lặp tới khi xong (mỗi lần = 1 bước ngắn) */
  async function runExtract() {
    if (engine === "AI" && !aiConfigured) {
      setMsg({ ok: false, text: "Máy chủ chưa cấu hình khóa Gemini nên chưa dùng engine AI. Chọn 'Tự động (offline)'." });
      return;
    }
    setExtracting(true);
    setMsg(null);
    setExtractedCount(0);
    let guard = 0;
    try {
      while (guard++ < 80) {
        const res = await fetch(`/api/documents/${doc.id}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engine }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          setMsg({ ok: false, text: data.error ?? "Đọc file bị lỗi — thử bấm lại để đọc tiếp" });
          break;
        }
        if (typeof data.extracted === "number") setExtractedCount((n) => n + data.extracted);
        if (typeof data.cursor === "number") setCursor(data.cursor);
        if (typeof data.pagesDone === "number") setPagesDone(data.pagesDone);
        if (typeof data.totalPages === "number") setTotalPages(data.totalPages);
        if (data.done) {
          await refresh();
          setMsg({ ok: true, text: "Đọc xong toàn bộ file — giờ kiểm tra và sửa từng câu bên phải" });
          break;
        }
      }
      if (guard >= 80) setMsg({ ok: false, text: "File rất dài — bấm tiếp để đọc phần còn lại" });
    } finally {
      setExtracting(false);
    }
  }

  /** Sinh đáp án cho các câu đang thiếu bằng Gemini (1 lần gọi, có cap chi phí) */
  async function runGenAnswers() {
    const missing = items.filter((it) => (it.payload.answer ?? null) === null).length;
    if (missing === 0) {
      setMsg({ ok: false, text: "Mọi câu đều đã có đáp án." });
      return;
    }
    if (aiCalls >= MAX_GEN_CALLS) {
      setMsg({ ok: false, text: `Đã hết ${MAX_GEN_CALLS} lượt gọi AI cho tài liệu này — nhập đáp án tay.` });
      return;
    }
    if (!window.confirm(`Dùng AI (Gemini) sinh đáp án cho ${missing} câu đang thiếu? AI có thể sai — nhớ kiểm tra lại.`)) return;
    setGenBusy(true);
    setMsg(null);
    const res = await fetch(`/api/documents/${doc.id}/gen-answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setGenBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Sinh đáp án AI bị lỗi" });
      return;
    }
    await refresh();
    setMsg({
      ok: true,
      text: `AI đã sinh đáp án cho ${data.generated ?? 0}/${missing} câu${data.aiCalls ? ` · đã dùng ${data.aiCalls}/${MAX_GEN_CALLS} lượt AI` : ""}. Kiểm tra lại từng câu.`,
    });
  }

  /** Parse lại từ đầu (xóa câu đã đọc, giữ file + text đã OCR) */
  async function doReset() {
    if (!window.confirm("Parse lại từ đầu? Xóa toàn bộ câu đã đọc và tiến độ. File gốc & text OCR được giữ.")) return;
    setMsg(null);
    const res = await fetch(`/api/documents/${doc.id}/extract`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không reset được" });
      return;
    }
    setItems([]);
    setDocStatus("UPLOADED");
    setDocError("");
    setCursor(0);
    setPagesDone(0);
    setAiCalls(0);
    setMsg({ ok: true, text: "Đã reset — bấm 'Đọc file' để parse lại." });
  }

  async function patchItem(id: string, body: { payload?: ExtractedQuestion; status?: ExtractedItem["status"] }) {
    setBusyId(id);
    const res = await fetch(`/api/documents/${doc.id}/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không lưu được thay đổi" });
      return false;
    }
    const updated = data.item as ExtractedItem;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...updated, payload: updated.payload ?? i.payload } : i)));
    return true;
  }

  async function removeItem(id: string) {
    if (!window.confirm("Xóa hẳn câu này khỏi danh sách đọc được?")) return;
    setBusyId(id);
    const res = await fetch(`/api/documents/${doc.id}/items/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      setMsg({ ok: false, text: "Không xóa được câu" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function bulkApprove() {
    const targets = items.filter((i) => i.status === "PENDING" && i.confidence >= 0.9).slice(0, 60);
    if (targets.length === 0) {
      setMsg({ ok: false, text: "Không có câu chưa duyệt nào đạt độ tin cậy ≥ 90%" });
      return;
    }
    setBulkBusy(true);
    setMsg(null);
    let done = 0;
    for (const t of targets) {
      const ok = await patchItem(t.id, { status: "APPROVED" });
      if (!ok) break;
      done++;
    }
    setBulkBusy(false);
    setMsg({
      ok: true,
      text: `Đã duyệt nhanh ${done} câu${targets.length === 60 ? " (còn nữa — bấm tiếp)" : ""}. Câu dưới 90% vẫn phải xem tay.`,
    });
  }

  function startEdit(it: ExtractedItem) {
    setEditingId(it.id);
    setDraft({
      ...it.payload,
      options: (it.payload.options ?? []).map((o) => ({ ...o })),
      answer: Array.isArray(it.payload.answer) ? [...(it.payload.answer as (string | boolean)[])] : it.payload.answer,
    } as ExtractedQuestion);
  }

  async function saveEdit() {
    if (!editingId || !draft) return;
    const ok = await patchItem(editingId, { payload: draft });
    if (ok) {
      setEditingId(null);
      setDraft(null);
      setMsg({ ok: true, text: "Đã lưu sửa đổi" });
    }
  }

  async function doImport() {
    const approvedCount = items.filter((i) => i.status === "APPROVED" || i.status === "EDITED").length;
    if (approvedCount === 0) {
      setMsg({ ok: false, text: "Chưa duyệt câu nào nên chưa tạo đề được" });
      return;
    }
    setImporting(true);
    setMsg(null);
    const res = await fetch(`/api/documents/${doc.id}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: importTitle, minutesPerSection: importMinutes }),
    });
    const data = await res.json().catch(() => ({}));
    setImporting(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Không tạo được đề" });
      return;
    }
    router.push(`/giao-vien/de-thi/${data.examId}`);
  }

  const approvedCount = counts.APPROVED + counts.EDITED;
  const progressPct = total > 0 ? Math.min(100, Math.round((cursor / total) * 100)) : 0;
  const isScan = doc.fileType === "pdf_scan";
  const ocrPct = totalPages > 0 ? Math.min(100, Math.round((pagesDone / totalPages) * 100)) : 0;
  const needsExtract = docStatus === "UPLOADED" || docStatus === "PROCESSING";
  const missingAnswerCount = items.filter((it) => (it.payload.answer ?? null) === null).length;

  return (
    <div className="pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{doc.fileName}</h1>
        {isScan && <Badge color="slate">PDF scan (ảnh)</Badge>}
        {docStatus === "FAILED" && <Badge color="red">Không đọc được</Badge>}
        {docStatus === "IMPORTED" && <Badge color="green">Đã tạo đề nháp</Badge>}
        {needsExtract && <Badge color="blue">Chưa đọc xong</Badge>}
      </div>
      {docError && <p className="mt-1 text-sm text-rose-600">{docError}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bản gốc</span>
              <Input
                className="max-w-[16rem] flex-1 py-1 text-xs"
                placeholder="Tìm trong bản gốc..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {queryMatches.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Button variant="ghost" className="px-1.5 py-0.5 text-xs" onClick={() => setQAt((n) => Math.max(0, n - 1))}>↑</Button>
                  {Math.min(qAt, queryMatches.length - 1) + 1}/{queryMatches.length}
                  <Button variant="ghost" className="px-1.5 py-0.5 text-xs" onClick={() => setQAt((n) => Math.min(queryMatches.length - 1, n + 1))}>↓</Button>
                </span>
              )}
              {focus && (
                <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setFocus(null)}>Bỏ chọn đoạn</Button>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto bg-white">
                  <pre className="whitespace-pre-wrap break-words p-3 font-sans text-[13px] leading-relaxed text-slate-700">
                    {activeRange ? (
                      <>
                        {sourceText.slice(0, activeRange.start)}
                        <mark ref={markRef} className="rounded bg-amber-200 px-0.5 text-slate-900">
                          {sourceText.slice(activeRange.start, activeRange.end)}
                        </mark>
                        {sourceText.slice(activeRange.end)}
                      </>
                    ) : (
                      sourceText
                    )}
                  </pre>
            </div>
          </Card>
        </div>

        <div>
          {needsExtract && (
            <Card className="mb-4 p-4">
              <p className="text-sm font-semibold">Đọc file</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Engine đọc:</span>
                <Select
                  className="w-56 py-1 text-xs"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as "OFFLINE" | "AI")}
                >
                  <option value="OFFLINE">Tự động (offline) — miễn phí</option>
                  <option value="AI">AI (Gemini) — tốn lượt gọi</option>
                </Select>
              </div>

              {/* Tiến độ: PDF scan = OCR từng trang; khác = parse theo ký tự */}
              <div className="mt-3">
                {isScan && totalPages > 0 ? (
                  <>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-blue-600 transition-all" style={{ width: `${ocrPct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      OCR trang {pagesDone}/{totalPages} ({ocrPct}%)
                    </p>
                  </>
                ) : (
                  <>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-blue-600 transition-all" style={{ width: `${engine === "OFFLINE" ? 100 : progressPct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {engine === "OFFLINE" ? "Parse toàn bộ văn bản (1 bước)" : `Đã đọc ${progressPct}%`} ·{" "}
                      {extractedCount > 0 ? `${extractedCount} câu mới · ` : ""}
                      {items.length} câu trong danh sách
                    </p>
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={runExtract} disabled={extracting || (engine === "AI" && !aiConfigured)}>
                  {extracting
                    ? "Đang đọc..."
                    : isScan && totalPages > 0 && pagesDone < totalPages
                      ? pagesDone > 0
                        ? `OCR tiếp (trang ${pagesDone + 1}/${totalPages})`
                        : "Bắt đầu OCR"
                      : isScan || engine === "OFFLINE"
                        ? "Parse câu hỏi"
                        : cursor > 0
                          ? "Đọc tiếp"
                          : "Bắt đầu đọc bằng AI"}
                </Button>
                <Button variant="secondary" onClick={doReset} disabled={extracting}>
                  Parse lại từ đầu
                </Button>
              </div>

              {engine === "AI" && !aiConfigured && (
                <p className="mt-2 text-xs text-amber-700">Chưa có khóa Gemini trên máy chủ (GEMINI_API_KEY).</p>
              )}
              {engine === "OFFLINE" && (
                <p className="mt-2 text-xs text-slate-500">
                  Engine offline: parser thuần + OCR tesseract chạy ngay trên server — không tốn API. PDF scan sẽ được OCR
                  từng trang (mỗi lần bấm = 1 trang).
                </p>
              )}
            </Card>
          )}

          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="slate">{items.length} câu</Badge>
              <Badge color="amber">chưa duyệt {counts.PENDING}</Badge>
              <Badge color="green">đã duyệt {approvedCount}</Badge>
              {counts.REJECTED > 0 && <Badge color="red">loại {counts.REJECTED}</Badge>}
              <Select
                className="ml-auto w-40 py-1 text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="ALL">Tất cả</option>
                <option value="PENDING">Chưa duyệt</option>
                <option value="OK">Đã duyệt / đã sửa</option>
                <option value="REJECTED">Đã loại</option>
              </Select>
              <Button variant="secondary" className="py-1 text-xs" onClick={bulkApprove} disabled={bulkBusy}>
                {bulkBusy ? "Đang duyệt..." : "Duyệt nhanh câu ≥90%"}
              </Button>
            </div>
            {missingAnswerCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="text-xs text-amber-800">
                  <b>{missingAnswerCount}</b> câu đang thiếu đáp án — nhập tay từng câu (Sửa) hoặc để AI sinh:
                </span>
                <Button
                  variant="secondary"
                  className="py-1 text-xs"
                  onClick={runGenAnswers}
                  disabled={genBusy || aiCalls >= MAX_GEN_CALLS || !aiConfigured}
                >
                  {genBusy ? "Đang sinh..." : `Gen đáp án bằng AI (${aiCalls}/${MAX_GEN_CALLS})`}
                </Button>
                {!aiConfigured && <span className="text-xs text-amber-700">(chưa có GEMINI_API_KEY)</span>}
              </div>
            )}
            {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>}
          </Card>

          {items.length === 0 && !needsExtract && (
            <Card className="p-6 text-center text-sm text-slate-500">
              Không đọc được câu hỏi nào từ file này. Kiểm tra lại file (đề dạng ảnh/bảng phức tạp AI dễ bỏ sót) hoặc soạn
              đề thủ công.
            </Card>
          )}

          <div className="space-y-3">
            {visible.map((it) => {
              const q = it.payload;
              const ed = editingId === it.id ? draft : null;
              const view: ExtractedQuestion = ed ?? q;
              const options = (view.options ?? []) as Opt[];
              const answer = (view.answer ?? null) as Answer;
              return (
                <Card key={it.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">#{it.seq}</span>
                    <Badge color="slate">
                      {view.type === "MC4" ? "4 lựa chọn" : view.type === "FILL" ? "Điền" : "Đúng/Sai"}
                    </Badge>
                    <Badge color={confColor(it.confidence)}>{Math.round(it.confidence * 100)}%</Badge>
                    <Badge color={it.status === "REJECTED" ? "red" : it.status === "PENDING" ? "amber" : "green"}>
                      {STATUS_LABEL[it.status] ?? it.status}
                    </Badge>
                    {view.sectionGuess && <span className="text-xs text-slate-500">phần: {view.sectionGuess}</span>}
                    <span className="ml-auto flex items-center gap-1">
                      {q.sourceSnippet && (
                        <Button
                          variant="ghost"
                          className="px-2 py-0.5 text-xs"
                          onClick={() => setFocus({ needle: q.sourceSnippet!, token: it.seq })}
                        >
                          Xem bản gốc
                        </Button>
                      )}
                      {!ed ? (
                        <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => startEdit(it)}>Sửa</Button>
                      ) : (
                        <>
                          <Button className="px-2 py-0.5 text-xs" onClick={saveEdit} disabled={busyId === it.id}>Lưu</Button>
                          <Button
                            variant="ghost"
                            className="px-2 py-0.5 text-xs"
                            onClick={() => {
                              setEditingId(null);
                              setDraft(null);
                            }}
                          >
                            Hủy
                          </Button>
                        </>
                      )}
                      {!ed && it.status !== "REJECTED" && (
                        <Button
                          variant="ghost"
                          className="px-2 py-0.5 text-xs text-emerald-700"
                          disabled={busyId === it.id}
                          onClick={() => patchItem(it.id, { status: "APPROVED" })}
                        >
                          Duyệt
                        </Button>
                      )}
                      {!ed && (
                        <Button
                          variant="ghost"
                          className="px-2 py-0.5 text-xs text-rose-600"
                          disabled={busyId === it.id}
                          onClick={() =>
                            it.status === "REJECTED" ? patchItem(it.id, { status: "PENDING" }) : patchItem(it.id, { status: "REJECTED" })
                          }
                        >
                          {it.status === "REJECTED" ? "Bỏ loại" : "Loại"}
                        </Button>
                      )}
                      {!ed && (
                        <Button variant="ghost" className="px-2 py-0.5 text-xs text-slate-400" disabled={busyId === it.id} onClick={() => removeItem(it.id)}>
                          Xóa
                        </Button>
                      )}
                    </span>
                  </div>

                  <div className="mt-2">
                    {ed ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <div className="w-44">
                            <Field label="Loại câu">
                              <Select
                                value={view.type}
                                onChange={(e) => {
                                  const type = e.target.value as ExtractedQuestion["type"];
                                  if (type === "MC4") {
                                    setDraft({
                                      ...ed,
                                      type,
                                      options: ["A", "B", "C", "D"].map((id, i) => ({ id, text: ed.options?.[i]?.text ?? "" })),
                                      answer: typeof ed.answer === "string" ? ed.answer : undefined,
                                    });
                                  } else if (type === "TRUE_FALSE") {
                                    setDraft({ ...ed, type, answer: [false, false, false, false] });
                                  } else {
                                    setDraft({ ...ed, type, answer: [] });
                                  }
                                }}
                              >
                                <option value="MC4">4 lựa chọn (A–D)</option>
                                <option value="FILL">Điền đáp án</option>
                                <option value="TRUE_FALSE">Đúng/Sai 4 ý</option>
                              </Select>
                            </Field>
                          </div>
                          <div className="w-56">
                            <Field label="Thuộc phần" hint="Dùng để gom thành phần khi tạo đề">
                              <Input
                                value={view.sectionGuess ?? ""}
                                onChange={(e) => setDraft({ ...ed, sectionGuess: e.target.value })}
                                placeholder="VD: Phần 1 — Toán"
                              />
                            </Field>
                          </div>
                        </div>
                        <Field label="Đề bài" hint="LaTeX: $x^2$ hoặc $$...$$">
                          <Textarea rows={4} value={view.stem ?? ""} onChange={(e) => setDraft({ ...ed, stem: e.target.value })} />
                        </Field>
                        {view.type === "MC4" && (
                          <Mc4Editor
                            name={`rev-${it.id}`}
                            options={options}
                            answer={answer}
                            onChange={(p) => setDraft({ ...ed, options: p.options ?? ed.options, answer: p.answer !== undefined ? (p.answer as ExtractedQuestion["answer"]) : ed.answer })}
                          />
                        )}
                        {view.type === "FILL" && (
                          <FillEditor
                            answer={answer}
                            onChange={(p) => setDraft({ ...ed, answer: p.answer as ExtractedQuestion["answer"] })}
                          />
                        )}
                        {view.type === "TRUE_FALSE" && (
                          <TrueFalseEditor
                            options={options}
                            answer={answer}
                            onChange={(p) => setDraft({ ...ed, options: p.options ?? ed.options, answer: p.answer !== undefined ? (p.answer as ExtractedQuestion["answer"]) : ed.answer })}
                          />
                        )}
                        <Field label="Giải thích (không bắt buộc — có thể sinh bằng AI sau khi tạo đề)">
                          <Textarea rows={3} value={view.explanation ?? ""} onChange={(e) => setDraft({ ...ed, explanation: e.target.value })} />
                        </Field>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-slate-800">
                          <TeX text={view.stem ?? ""} />
                        </div>
                        {view.type === "MC4" && options.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm text-slate-600">
                            {options.map((o) => (
                              <li key={o.id} className={answer === o.id ? "font-semibold text-emerald-700" : ""}>
                                {o.id}. <TeX text={o.text} />
                              </li>
                            ))}
                          </ul>
                        )}
                        {view.type === "TRUE_FALSE" && options.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm text-slate-600">
                            {options.map((o, i) => {
                              const subs = Array.isArray(answer) ? (answer as boolean[]) : [];
                              return (
                                <li key={o.id}>
                                  {o.id}) <TeX text={o.text} />
                                  <span className={`ml-2 text-xs font-semibold ${subs[i] ? "text-emerald-700" : "text-rose-600"}`}>
                                    {subs[i] ? "Đúng" : "Sai"}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <p className="mt-2 text-xs text-slate-500">
                          Đáp án: <AnswerSummary type={view.type} answer={answer} />
                        </p>
                        {view.explanation && (
                          <p className="mt-1 text-xs text-slate-500">
                            Giải thích: <TeX text={view.explanation} />
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {items.length > 0 && (
            <Card className="mt-4 p-4">
              {!importOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Đã duyệt <b>{approvedCount}</b>/{items.length} câu. Khi tạo đề, các câu sẽ được gom theo &quot;phần&quot; mà AI
                    đoán (bạn sửa được ở ô Thuộc phần).
                  </p>
                  <Button onClick={() => setImportOpen(true)} disabled={approvedCount === 0}>Tạo đề nháp từ câu đã duyệt</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Tạo đề nháp</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Tên đề">
                      <Input value={importTitle} onChange={(e) => setImportTitle(e.target.value)} minLength={3} />
                    </Field>
                    <Field label="Thời gian mỗi phần (phút)">
                      <Input
                        type="number"
                        min={1}
                        max={300}
                        value={importMinutes}
                        onChange={(e) => setImportMinutes(Number(e.target.value))}
                      />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={doImport} disabled={importing || importTitle.trim().length < 3}>
                      {importing ? "Đang tạo..." : `Tạo đề với ${approvedCount} câu`}
                    </Button>
                    <Button variant="ghost" onClick={() => setImportOpen(false)}>Hủy</Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Đề tạo ra ở trạng thái nháp — bạn còn chỉnh điểm, thứ tự, thêm giải thích AI rồi mới phát hành.
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
