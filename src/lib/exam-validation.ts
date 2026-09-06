import type { TemplateSectionSpec } from "./templates";

export type QuestionDraft = {
  type: string;
  stem: string;
  options?: { id: string; text: string }[];
  answer?: unknown;
  explanation?: string;
  points?: number;
  isTrial?: boolean;
};

export type SectionDraft = {
  id?: string;
  code?: string;
  title?: string;
  minutes?: number;
  questions: QuestionDraft[];
};

export type PublishIssue = { section: string; question?: number; message: string };

export function validateQuestion(q: QuestionDraft, sectionTitle: string, index: number): string[] {
  const errs: string[] = [];
  const label = `Câu ${index + 1}`;
  if (!q.stem || q.stem.trim().length < 3) errs.push(`${label}: đề bài trống`);
  if (q.type === "MC4") {
    const opts = q.options ?? [];
    if (opts.length !== 4) errs.push(`${label}: cần đúng 4 lựa chọn`);
    if (opts.some((o) => !o.text || !o.text.trim())) errs.push(`${label}: có lựa chọn trống`);
    const ids = opts.map((o) => o.id);
    if (typeof q.answer !== "string" || !ids.includes(q.answer)) errs.push(`${label}: đáp án phải là một trong các lựa chọn A/B/C/D`);
  } else if (q.type === "FILL") {
    // answer đến từ JSON (z.unknown()) — có thể chứa number/boolean/null, phải lọc trước khi .trim()
    const raw = Array.isArray(q.answer) ? q.answer : [];
    const accepted = raw.every((a) => typeof a === "string") ? (raw as string[]) : [];
    if (accepted.length === 0 || accepted.every((a) => !a || !a.trim())) errs.push(`${label}: cần ít nhất 1 đáp án chấp nhận được`);
    if (raw.length > 0 && accepted.length !== raw.length) errs.push(`${label}: đáp án điền khuyết chứa giá trị không phải chuỗi`);
  } else if (q.type === "TRUE_FALSE") {
    const subs = Array.isArray(q.answer) ? (q.answer as unknown[]) : [];
    if (subs.length !== 4 || subs.some((b) => typeof b !== "boolean")) errs.push(`${label}: cần đủ 4 ý đúng/sai`);
    const texts = q.options ?? [];
    if (texts.length !== 4 || texts.some((o) => !o.text || !o.text.trim())) {
      errs.push(`${label}: cần đủ nội dung 4 ý a–d để học sinh chọn đúng/sai`);
    }
  } else {
    errs.push(`${label}: loại câu không hỗ trợ (${q.type})`);
  }
  if ((q.points ?? 1) <= 0) errs.push(`${label}: điểm phải > 0`);
  return errs.map((e) => e.replace(label, `${sectionTitle} — ${label}`));
}

/** Validate toàn đề trước khi publish. templateSpecs: nếu đề theo khuôn, kiểm tra đúng số câu từng phần */
export function validateForPublish(
  draftSections: SectionDraft[],
  templateSpecs?: TemplateSectionSpec[]
): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (draftSections.length === 0) {
    issues.push({ section: "Đề thi", message: "Chưa có phần nào" });
    return issues;
  }
  for (const s of draftSections) {
    const title = s.title || s.code || "Phần";
    if (s.questions.length === 0) {
      issues.push({ section: title, message: "Chưa có câu hỏi" });
      continue;
    }
    s.questions.forEach((q, i) => {
      for (const message of validateQuestion(q, title, i)) {
        issues.push({ section: title, question: i + 1, message });
      }
    });
    if (templateSpecs) {
      const spec = templateSpecs.find((t) => t.code === s.code || t.title === s.title);
      if (spec) {
        const scored = s.questions.filter((q) => !q.isTrial).length;
        const trials = s.questions.filter((q) => q.isTrial).length;
        if (scored !== spec.questions) {
          issues.push({
            section: title,
            message: `Sai khuôn kỳ thi: cần ${spec.questions} câu tính điểm, đang có ${scored}`,
          });
        }
        if (trials > (spec.trials ?? 0)) {
          issues.push({ section: title, message: `Vượt số câu thử nghiệm cho phép (${spec.trials ?? 0})` });
        }
      } else {
        issues.push({ section: title, message: "Phần không khớp với khuôn kỳ thi đã chọn" });
      }
    }
  }
  return issues;
}
