import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  attemptAnswers,
  attemptSections,
  attempts,
  assignments,
  exams,
  questions,
  sections,
  examTemplates,
} from "./db/schema";
import { shuffle, questionSeed, scoreQuestion } from "./exam-utils";
import { GRACE_SECONDS } from "./templates";
import { buildSnapshot, type ExamSnapshot } from "./snapshot";
import type { SessionUser } from "./auth";

export type Mode = "EXAM" | "MOCK_FULL" | "PRACTICE";

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Tạo lượt thi: seed trộn đề, deadline từng phần (server là nguồn chân lý) */
export async function startAttempt(opts: {
  examId: string;
  studentId: string;
  mode: Mode;
  assignmentId?: string | null;
  practiceSectionId?: string | null;
}) {
  const examRows = await db.select().from(exams).where(eq(exams.id, opts.examId));
  const exam = examRows[0];
  if (!exam || exam.status !== "PUBLISHED") throw new Error("Đề thi không tồn tại hoặc chưa được phát hành");

  const [sectionRows, qRows] = await Promise.all([
    db.select().from(sections).where(eq(sections.examId, exam.id)),
    db.select().from(questions).where(eq(questions.examId, exam.id)),
  ]);
  sectionRows.sort((a, b) => a.position - b.position);
  if (sectionRows.length === 0) throw new Error("Đề thi chưa có phần nào");

  const isPractice = opts.mode === "PRACTICE";
  const timingMode = isPractice ? "GLOBAL" : exam.templateCode ? await templateTimingMode(exam.templateCode) : "PER_SECTION";

  // Đóng băng nội dung đề NGAY LÚC bắt đầu — sau đó mọi truy vấn làm bài & chấm điểm
  // đều dùng bản này, không đọc lại DB (chống việc giáo viên sửa đề làm lệch bài thi).
  const snapshot = buildSnapshot(exam, sectionRows, qRows);

  const now = new Date();
  const seed = Math.floor(Math.random() * 2 ** 31);

  const attemptRows = await db
    .insert(attempts)
    .values({
      assignmentId: opts.assignmentId ?? null,
      examId: exam.id,
      studentId: opts.studentId,
      mode: opts.mode,
      shuffleSeed: exam.shuffleQuestions || exam.shuffleOptions ? seed : 0,
      timingMode: isPractice ? "GLOBAL" : timingMode,
      practiceSectionId: opts.practiceSectionId ?? null,
      globalDeadlineAt:
        !isPractice && timingMode === "GLOBAL"
          ? addMinutes(now, exam.totalMinutes ?? sumMinutes(sectionRows))
          : null,
      contentSnapshot: snapshot as never,
    })
    .returning({ id: attempts.id });
  const attemptId = attemptRows[0].id;

  const activeSections = isPractice && opts.practiceSectionId
    ? sectionRows.filter((s) => s.id === opts.practiceSectionId)
    : sectionRows;

  const values = activeSections.map((s, i) => {
    const startNow = isPractice || timingMode === "GLOBAL" || i === 0;
    return {
      attemptId,
      sectionId: s.id,
      position: i + 1,
      startedAt: startNow ? now : null,
      deadlineAt:
        isPractice || timingMode === "GLOBAL" ? null : startNow ? addMinutes(now, s.minutes) : null,
      lockedAt: null,
    };
  });
  await db.insert(attemptSections).values(values);
  return attemptId;
}

function sumMinutes(ss: { minutes: number }[]) {
  return ss.reduce((a, s) => a + s.minutes, 0);
}

async function templateTimingMode(code: string): Promise<string> {
  const rows = await db.select({ timingMode: examTemplates.timingMode }).from(examTemplates).where(eq(examTemplates.code, code));
  return rows[0]?.timingMode ?? "PER_SECTION";
}

export async function getAttempt(id: string) {
  const rows = await db.select().from(attempts).where(eq(attempts.id, id));
  return rows[0] ?? null;
}

/** Kiểm tra quyền truy cập dữ liệu của một lượt thi, gồm cả đáp án đúng. */
export async function canViewAttempt(attempt: { studentId: string; examId: string; assignmentId: string | null }, user: SessionUser) {
  if (user.role === "ADMIN") return true;
  if (user.role === "STUDENT") return attempt.studentId === user.id;

  const exam = (await db.select({ teacherId: exams.teacherId }).from(exams).where(eq(exams.id, attempt.examId)))[0];
  if (exam?.teacherId === user.id) return true;
  if (!attempt.assignmentId) return false;
  const assignment = (
    await db.select({ teacherId: assignments.teacherId }).from(assignments).where(eq(assignments.id, attempt.assignmentId))
  )[0];
  return assignment?.teacherId === user.id;
}

export async function getExam(id: string) {
  const rows = await db.select().from(exams).where(eq(exams.id, id));
  return rows[0] ?? null;
}

/**
 * Lấy nội dung đề đóng băng của một lượt thi.
 * - Có snapshot (lượt mới) → trả về đúng nội dung tại lúc bắt đầu (không đọc lại DB).
 * - Không có (lượt cũ tạo trước khi có tính năng) → fallback đọc live từ DB.
 */
async function loadSnapshot(attempt: { examId: string; contentSnapshot: unknown }): Promise<ExamSnapshot> {
  if (attempt.contentSnapshot) return attempt.contentSnapshot as ExamSnapshot;
  const exam = (await db.select().from(exams).where(eq(exams.id, attempt.examId)))[0];
  if (!exam) throw new Error("Đề thi không tồn tại");
  const [sectionRows, qRows] = await Promise.all([
    db.select().from(sections).where(eq(sections.examId, exam.id)),
    db.select().from(questions).where(eq(questions.examId, exam.id)),
  ]);
  return buildSnapshot(exam, sectionRows, qRows);
}

/** Phạm vi câu hỏi/phần của một lượt thi từ snapshot: PRACTICE chỉ gồm đúng phần đang luyện */
function scopeFromSnapshot(
  snap: ExamSnapshot,
  mode: string,
  practiceSectionId: string | null
): { sections: ExamSnapshot["sections"]; questions: ExamSnapshot["questions"] } {
  if (mode === "PRACTICE" && practiceSectionId) {
    const sections = snap.sections.filter((s) => s.id === practiceSectionId);
    const ids = new Set(sections.map((s) => s.id));
    const questions = snap.questions.filter((q) => ids.has(q.sectionId));
    return { sections, questions };
  }
  return { sections: snap.sections, questions: snap.questions };
}

/** Payload câu hỏi cho client — KHÔNG BAO GIỜ kèm đáp án đúng / giải thích / cờ isTrial */
export type ClientQuestion = {
  id: string;
  position: number;
  type: string;
  stem: string;
  options: { id: string; text: string }[];
  points: number;
  subCount?: number;
};

function toClientQuestion(q: {
  id: string;
  position: number;
  type: string;
  stem: string;
  options: unknown;
  points: number;
  shuffleSeed: number;
  shuffleOptions: boolean;
}): ClientQuestion {
  let options = Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : [];
  if (q.shuffleOptions && q.shuffleSeed !== 0 && q.type === "MC4") {
    options = shuffle(options, questionSeed(q.shuffleSeed, q.id));
  }
  return {
    id: q.id,
    position: q.position,
    type: q.type,
    stem: q.stem,
    options: q.type === "MC4" ? options.map((o) => ({ id: o.id, text: o.text })) : [],
    points: q.points,
    subCount: q.type === "TRUE_FALSE" ? 4 : undefined,
  };
}

/** Trạng thái lượt thi cho màn hình làm bài (đã finalize nếu quá hạn) */
export async function getAttemptState(attemptId: string, studentId: string) {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.studentId !== studentId) throw new Error("Không tìm thấy lượt thi");
  await finalizeIfExpired(attempt);
  const fresh = (await getAttempt(attemptId))!;

  const snap = await loadSnapshot(fresh);
  const aSections = await db.select().from(attemptSections).where(eq(attemptSections.attemptId, attemptId));
  aSections.sort((a, b) => a.position - b.position);
  const sectionById = new Map(snap.sections.map((s) => [s.id, s]));

  const qRows = snap.questions;
  const ansRows = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId));

  const now = Date.now();
  const outSections = aSections.map((as) => {
    const sec = sectionById.get(as.sectionId)!;
    const qs = qRows.filter((q) => q.sectionId === as.sectionId);
    const ordered =
      snap.exam.shuffleQuestions && fresh.shuffleSeed !== 0
        ? shuffle(qs, questionSeed(fresh.shuffleSeed, as.sectionId))
        : qs;
    const deadlineMs = as.deadlineAt ? as.deadlineAt.getTime() : null;
    const globalDeadlineMs = fresh.globalDeadlineAt ? fresh.globalDeadlineAt.getTime() : null;
    const expired =
      fresh.status !== "ACTIVE" ||
      Boolean(as.lockedAt) ||
      (deadlineMs !== null && now > deadlineMs + GRACE_SECONDS * 1000) ||
      (fresh.timingMode === "GLOBAL" && globalDeadlineMs !== null && now > globalDeadlineMs + GRACE_SECONDS * 1000);
    return {
      attemptSectionId: as.id,
      sectionId: as.sectionId,
      code: sec.code,
      title: sec.title,
      position: as.position,
      startedAt: as.startedAt,
      deadlineAt: as.deadlineAt,
      lockedAt: as.lockedAt,
      expired,
      questions: ordered.map((q) =>
        toClientQuestion({ ...q, shuffleSeed: fresh.shuffleSeed, shuffleOptions: snap.exam.shuffleOptions })
      ),
    };
  });

  return {
    attempt: {
      id: fresh.id,
      status: fresh.status,
      mode: fresh.mode,
      timingMode: fresh.timingMode,
      startedAt: fresh.startedAt,
      submittedAt: fresh.submittedAt,
      globalDeadlineAt: fresh.globalDeadlineAt,
      score: fresh.score,
      maxScore: fresh.maxScore,
    },
    exam: { id: snap.exam.id, title: snap.exam.title, templateCode: snap.exam.templateCode },
    sections: outSections,
    answers: Object.fromEntries(
      ansRows.map((a) => [a.questionId, { answer: a.answer, clientSeq: a.clientSeq, savedAt: a.savedAt }])
    ),
    serverNow: new Date(),
  };
}

/** Lưu đáp án idempotent theo clientSeq; từ chối nếu phần đã khóa/quá hạn */
export async function saveAnswer(opts: {
  attemptId: string;
  studentId: string;
  questionId: string;
  clientSeq: number;
  answer: unknown;
  timeSpentMs?: number;
}) {
  const attempt = await getAttempt(opts.attemptId);
  if (!attempt || attempt.studentId !== opts.studentId) return { ok: false, error: "Không tìm thấy lượt thi" };
  await finalizeIfExpired(attempt);
  const fresh = (await getAttempt(opts.attemptId))!;
  if (fresh.status !== "ACTIVE") return { ok: false, error: "Lượt thi đã nộp", code: "SUBMITTED" };

  const snap = await loadSnapshot(fresh);
  const q = snap.questions.find((question) => question.id === opts.questionId);
  if (!q) return { ok: false, error: "Câu hỏi không thuộc lượt thi này" };

  const now = Date.now();
  if (fresh.mode !== "PRACTICE") {
    if (fresh.timingMode === "GLOBAL") {
      if (fresh.globalDeadlineAt && now > fresh.globalDeadlineAt.getTime() + GRACE_SECONDS * 1000) {
        return { ok: false, error: "Đã hết giờ làm bài", code: "EXPIRED" };
      }
    } else {
      const asRows = await db
        .select()
        .from(attemptSections)
        .where(and(eq(attemptSections.attemptId, fresh.id), eq(attemptSections.sectionId, q.sectionId)));
      const as = asRows[0];
      if (!as || as.lockedAt || !as.startedAt) return { ok: false, error: "Phần này đã bị khóa", code: "LOCKED" };
      if (as.deadlineAt && now > as.deadlineAt.getTime() + GRACE_SECONDS * 1000) {
        return { ok: false, error: "Đã hết thời gian phần này", code: "EXPIRED" };
      }
    }
  }

  // Upsert nguyên tử: clientSeq mới hơn mới ghi đè, chống 2 request đồng thời
  // cùng đọc một bản ghi cũ rồi cùng update (lost update).
  const savedAt = new Date();
  const inserted = await db
    .insert(attemptAnswers)
    .values({
      attemptId: fresh.id,
      questionId: q.id,
      clientSeq: opts.clientSeq,
      answer: opts.answer as never,
      timeSpentMs: opts.timeSpentMs ?? 0,
      savedAt,
    })
    .onConflictDoUpdate({
      target: [attemptAnswers.attemptId, attemptAnswers.questionId],
      set: {
        clientSeq: opts.clientSeq,
        answer: opts.answer as never,
        timeSpentMs: opts.timeSpentMs ?? sql`${attemptAnswers.timeSpentMs}`,
        savedAt,
      },
      setWhere: sql`${attemptAnswers.clientSeq} <= ${opts.clientSeq}`,
    })
    .returning({ id: attemptAnswers.id, clientSeq: attemptAnswers.clientSeq });
  if (inserted.length === 0) return { ok: true, stale: true };
  return { ok: true };
}

/** Khóa phần hiện tại, mở phần kế tiếp (PER_SECTION). Cho phép nộp phần sớm. */
export async function advanceSection(attemptId: string, studentId: string) {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.studentId !== studentId) return { ok: false, error: "Không tìm thấy lượt thi" };
  if (attempt.status !== "ACTIVE") return { ok: false, error: "Lượt thi đã nộp" };
  if (attempt.timingMode !== "PER_SECTION" || attempt.mode === "PRACTICE") {
    return { ok: false, error: "Lượt thi này không chia phần theo thời gian riêng" };
  }

  const aSections = await db.select().from(attemptSections).where(eq(attemptSections.attemptId, attemptId));
  aSections.sort((a, b) => a.position - b.position);
  const current = aSections.find((s) => s.startedAt && !s.lockedAt);
  if (!current) return { ok: false, error: "Không có phần đang mở" };

  const now = new Date();
  await db.update(attemptSections).set({ lockedAt: now, deadlineAt: current.deadlineAt }).where(eq(attemptSections.id, current.id));

  const next = aSections.find((s) => !s.startedAt);
  if (!next) {
    await finalizeAttempt(attemptId, false);
    return { ok: true, finished: true };
  }
  const sectionRows = await db.select().from(sections).where(eq(sections.id, next.sectionId));
  const minutes = sectionRows[0]?.minutes ?? 0;
  await db
    .update(attemptSections)
    .set({ startedAt: now, deadlineAt: addMinutes(now, minutes) })
    .where(eq(attemptSections.id, next.id));
  return { ok: true, finished: false, nextSectionId: next.sectionId };
}

/** Phạm vi câu hỏi/phần để chấm điểm: đọc từ snapshot (nội dung đóng băng), PRACTICE chỉ phần đang luyện */
async function attemptScope(attempt: { examId: string; contentSnapshot: unknown; mode: string; practiceSectionId: string | null }) {
  const snap = await loadSnapshot(attempt);
  const { sections, questions } = scopeFromSnapshot(snap, attempt.mode, attempt.practiceSectionId);
  return { qRows: questions, sectionRows: sections };
}

/** Chấm điểm & đóng lượt thi. Idempotent. */
export async function finalizeAttempt(attemptId: string, auto: boolean) {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.status !== "ACTIVE") return attempt;

  const { qRows, sectionRows } = await attemptScope(attempt);
  const ansRows = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId));
  const ansByQ = new Map(ansRows.map((a) => [a.questionId, a]));

  const sectionScores: Record<string, { score: number; max: number; correct: number; total: number; title: string }> = {};
  for (const s of sectionRows) sectionScores[s.id] = { score: 0, max: 0, correct: 0, total: 0, title: s.title };

  let total = 0;
  let maxTotal = 0;
  for (const q of qRows) {
    const ss = sectionScores[q.sectionId];
    if (!ss) continue;
    if (q.isTrial) continue; // câu thử nghiệm không tính điểm
    ss.max += q.points;
    ss.total += 1;
    maxTotal += q.points;
    const ans = ansByQ.get(q.id);
    if (ans && ans.answer != null) {
      const earned = scoreQuestion(q.type, JSON.stringify(q.answer ?? null), JSON.stringify(ans.answer), q.points);
      ss.score += earned;
      total += earned;
      if (earned >= q.points - 1e-9) ss.correct += 1;
    }
  }

  const rounded = Math.round(total * 100) / 100;
  const updated = await db
    .update(attempts)
    .set({
      status: auto ? "AUTO_SUBMITTED" : "SUBMITTED",
      submittedAt: new Date(),
      score: rounded,
      maxScore: maxTotal,
      sectionScores: sectionScores as never,
    })
    .where(and(eq(attempts.id, attemptId), eq(attempts.status, "ACTIVE")))
    .returning();
  return updated[0] ?? (await getAttempt(attemptId));
}

/**
 * Pure: một lượt thi có bị coi là "hết giờ" tại thời điểm nowMs không?
 * (Dùng chung cho finalizeIfExpired, cron sweep, và UI — một nguồn chân lý.)
 * PRACTICE và các lượt đã nộp không bao giờ "hết giờ".
 */
export function isExpired(
  a: {
    status: string;
    mode: string;
    timingMode: string;
    globalDeadlineAt: Date | null;
    sections: { lockedAt: Date | null; deadlineAt: Date | null; startedAt: Date | null }[];
  },
  nowMs: number
): boolean {
  if (a.status !== "ACTIVE" || a.mode === "PRACTICE") return false;
  const grace = GRACE_SECONDS * 1000;
  if (a.timingMode === "GLOBAL") {
    return Boolean(a.globalDeadlineAt && nowMs > a.globalDeadlineAt.getTime() + grace);
  }
  const started = a.sections.some((s) => s.startedAt);
  const done = a.sections.length > 0 && a.sections.every((s) => s.lockedAt || (s.deadlineAt && nowMs > s.deadlineAt.getTime() + grace));
  return started && done;
}

/** Lazy-finalize: quá hạn (bỏ trống, tắt trình duyệt...) thì tự chốt điểm như thi thật */
export async function finalizeIfExpired(attempt: {
  id: string;
  status: string;
  mode: string;
  timingMode: string;
  globalDeadlineAt: Date | null;
}) {
  if (attempt.status !== "ACTIVE" || attempt.mode === "PRACTICE") return;
  const now = Date.now();
  if (attempt.timingMode === "GLOBAL") {
    if (isExpired({ ...attempt, sections: [] }, now)) await finalizeAttempt(attempt.id, true);
    return;
  }
  const aSections = await db.select().from(attemptSections).where(eq(attemptSections.attemptId, attempt.id));
  aSections.sort((a, b) => a.position - b.position);
  const current = aSections.find((section) => section.startedAt && !section.lockedAt);
  if (!current || !current.deadlineAt || now <= current.deadlineAt.getTime() + GRACE_SECONDS * 1000) return;

  // Client có thể đã đóng tab trước khi gọi /advance. Tự khóa phần hết giờ và
  // mở phần kế tiếp để attempt không bị ACTIVE vô hạn.
  await db.update(attemptSections).set({ lockedAt: new Date() }).where(eq(attemptSections.id, current.id));
  const next = aSections.find((section) => !section.startedAt);
  if (!next) {
    await finalizeAttempt(attempt.id, true);
    return;
  }
  const section = (await db.select({ minutes: sections.minutes }).from(sections).where(eq(sections.id, next.sectionId)))[0];
  const startedAt = new Date();
  await db
    .update(attemptSections)
    .set({ startedAt, deadlineAt: addMinutes(startedAt, section?.minutes ?? 0) })
    .where(eq(attemptSections.id, next.id));
}

/** Quét các lượt ACTIVE đã quá hạn của một học sinh (gọi khi tải dashboard) */
export async function sweepExpiredAttempts(studentId: string) {
  const active = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.studentId, studentId), eq(attempts.status, "ACTIVE")));
  for (const a of active) await finalizeIfExpired(a);
}

/** Quét TOÀN BỘ lượt ACTIVE đã quá hạn (cron server-side). Trả về số lượt đã chốt điểm. */
export async function sweepAllExpiredAttempts(): Promise<number> {
  const active = await db.select().from(attempts).where(eq(attempts.status, "ACTIVE"));
  let n = 0;
  for (const a of active) {
    if (a.mode === "PRACTICE") continue;
    if (a.timingMode === "GLOBAL") {
      if (isExpired({ ...a, sections: [] }, Date.now())) {
        const before = a.status;
        await finalizeAttempt(a.id, true);
        if (before === "ACTIVE") n += 1;
      }
      continue;
    }
    const aSections = await db.select().from(attemptSections).where(eq(attemptSections.attemptId, a.id));
    if (isExpired({ ...a, sections: aSections }, Date.now())) {
      const before = a.status;
      await finalizeAttempt(a.id, true);
      if (before === "ACTIVE") n += 1;
    }
  }
  return n;
}

/** Chính sách hiện kết quả */
export async function canRevealResult(attemptId: string, user: { id: string; role: string }) {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.status === "ACTIVE") return { allowed: false, reason: "Chưa nộp bài" };
  if (user.role !== "STUDENT") return { allowed: true };
  if (attempt.mode !== "EXAM") return { allowed: true }; // mock/practice: hiện ngay

  if (!attempt.assignmentId) return { allowed: true };
  const asRows = await db.select().from(assignments).where(eq(assignments.id, attempt.assignmentId));
  const a = asRows[0];
  if (!a) return { allowed: true };
  if (a.revealResult === "IMMEDIATE") return { allowed: true };
  if (a.revealResult === "AFTER_CLOSE") {
    if (!a.closesAt || new Date() >= a.closesAt) return { allowed: true };
    return { allowed: false, reason: `Kết quả sẽ mở sau khi hết hạn nộp bài (${a.closesAt.toLocaleString("vi-VN")})` };
  }
  return { allowed: false, reason: "Giáo viên chưa mở kết quả" };
}

/** Kết quả chi tiết: điểm từng phần, câu sai, đáp án đúng, giải thích — đọc từ snapshot (nội dung đóng băng) */
export async function buildResult(attemptId: string) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) throw new Error("Không tìm thấy lượt thi");
  const snap = await loadSnapshot(attempt);
  const qRows = snap.questions;
  const sectionById = new Map(snap.sections.map((s) => [s.id, s]));
  const ansRows = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId));
  const ansByQ = new Map(ansRows.map((a) => [a.questionId, a]));

  let template: { name: string; totalScore: number } | null = null;
  if (snap.exam.templateCode) {
    const tRows = await db.select().from(examTemplates).where(eq(examTemplates.code, snap.exam.templateCode));
    if (tRows[0]) template = { name: tRows[0].name, totalScore: tRows[0].totalScore };
  }

  const perQuestion = qRows
    .filter((q) => !q.isTrial)
    .sort((a, b) => a.position - b.position)
    .map((q) => {
      const ans = ansByQ.get(q.id);
      const earned = ans && ans.answer != null
        ? scoreQuestion(q.type, JSON.stringify(q.answer ?? null), JSON.stringify(ans.answer), q.points)
        : 0;
      const section = sectionById.get(q.sectionId);
      return {
        id: q.id,
        sectionTitle: section?.title ?? "",
        type: q.type,
        stem: q.stem,
        options: q.options,
        studentAnswer: ans?.answer ?? null,
        correctAnswer: q.answer,
        earned: Math.round(earned * 100) / 100,
        points: q.points,
        correct: earned >= q.points - 1e-9,
        explanation: q.explanation,
        timeSpentMs: ans?.timeSpentMs ?? 0,
      };
    });

  const converted =
    template && attempt.maxScore && attempt.maxScore > 0
      ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * template.totalScore)
      : null;

  return {
    attempt,
    exam: snap.exam,
    template,
    convertedEstimate: converted,
    sectionScores: (attempt.sectionScores ?? {}) as Record<string, { score: number; max: number; correct: number; total: number; title: string }>,
    perQuestion,
    totalTimeMs: attempt.submittedAt ? attempt.submittedAt.getTime() - attempt.startedAt.getTime() : null,
  };
}
