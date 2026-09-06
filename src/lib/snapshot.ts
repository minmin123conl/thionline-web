import type { Question, Section } from "./db/schema";

/**
 * Bản đóng băng nội dung đề tại thời điểm bắt đầu lượt thi.
 * Lưu jsonb vào attempts.contentSnapshot để:
 *  - getAttemptState phục hiện đúng câu hỏi học sinh đã nhìn thấy
 *  - finalizeAttempt / buildResult chấm đúng nội dung đó
 *  - buildResult hiện đúng đáp án đúng/giải thích tại thời điểm làm bài
 * Không bao giờ chứa gì vượt quá phạm vi "nội dung đề" (không chứa điểm, đáp án của bài làm).
 */
export type ExamSnapshot = {
  exam: {
    id: string;
    title: string;
    description: string;
    templateCode: string | null;
    totalMinutes: number | null;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    revealResult: string;
  };
  sections: { id: string; code: string; title: string; position: number; minutes: number }[];
  questions: {
    id: string;
    sectionId: string;
    position: number;
    type: string;
    stem: string;
    options: { id: string; text: string }[];
    answer: unknown;
    explanation: string;
    points: number;
    isTrial: boolean;
  }[];
};

export function buildSnapshot(
  exam: {
    id: string;
    title: string;
    description: string;
    templateCode: string | null;
    totalMinutes: number | null;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    revealResult: string;
  },
  sectionRows: Section[],
  qRows: Question[]
): ExamSnapshot {
  sectionRows.sort((a, b) => a.position - b.position);
  qRows.sort((a, b) => a.position - b.position);
  return {
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      templateCode: exam.templateCode,
      totalMinutes: exam.totalMinutes,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
      revealResult: exam.revealResult,
    },
    sections: sectionRows.map((s) => ({ id: s.id, code: s.code, title: s.title, position: s.position, minutes: s.minutes })),
    questions: qRows.map((q) => ({
      id: q.id,
      sectionId: q.sectionId,
      position: q.position,
      type: q.type,
      stem: q.stem,
      options: (q.options as { id: string; text: string }[]) ?? [],
      answer: q.answer ?? null,
      explanation: q.explanation,
      points: q.points,
      isTrial: q.isTrial,
    })),
  };
}
