import { describe, expect, it } from "vitest";
import { validateQuestion, validateForPublish } from "../exam-validation";

describe("validateQuestion", () => {
  const section = "Phần test";

  it("MC4 hợp lệ không lỗi", () => {
    const errs = validateQuestion(
      {
        type: "MC4",
        stem: "Câu hỏi gì đó?",
        options: [
          { id: "A", text: "1" },
          { id: "B", text: "2" },
          { id: "C", text: "3" },
          { id: "D", text: "4" },
        ],
        answer: "A",
      },
      section,
      0
    );
    expect(errs).toEqual([]);
  });

  it("FILL với answer chứa number không crash và báo lỗi rõ", () => {
    const errs = validateQuestion({ type: "FILL", stem: "1 + 1 = ?", answer: [123, true] }, section, 0);
    expect(errs.some((e) => e.includes("không phải chuỗi"))).toBe(true);
  });

  it("FILL hợp lệ (mảng chuỗi) không lỗi", () => {
    const errs = validateQuestion({ type: "FILL", stem: "Thủ đô Việt Nam là?", answer: ["Hà Nội"] }, section, 0);
    expect(errs).toEqual([]);
  });

  it("FILL answer null bị báo thiếu đáp án", () => {
    const errs = validateQuestion({ type: "FILL", stem: "Điền vào chỗ trống", answer: null }, section, 0);
    expect(errs.some((e) => e.includes("cần ít nhất 1 đáp án"))).toBe(true);
  });

  it("TRUE_FALSE đủ 4 boolean hợp lệ", () => {
    const errs = validateQuestion(
      {
        type: "TRUE_FALSE",
        stem: "Các phát biểu sau đúng hay sai?",
        options: [
          { id: "a", text: "Ý a" },
          { id: "b", text: "Ý b" },
          { id: "c", text: "Ý c" },
          { id: "d", text: "Ý d" },
        ],
        answer: [true, false, true, false],
      },
      section,
      0
    );
    expect(errs).toEqual([]);
  });

  it("điểm <= 0 bị báo lỗi", () => {
    const errs = validateQuestion({ type: "FILL", stem: "Câu hỏi?", answer: ["x"], points: 0 }, section, 0);
    expect(errs.some((e) => e.includes("điểm phải > 0"))).toBe(true);
  });
});

describe("validateForPublish", () => {
  it("đề rỗng bị báo chưa có phần", () => {
    const issues = validateForPublish([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("Chưa có phần nào");
  });

  it("section không có câu hỏi bị báo", () => {
    const issues = validateForPublish([{ title: "Phần 1", questions: [] }]);
    expect(issues.some((i) => i.message.includes("Chưa có câu hỏi"))).toBe(true);
  });
});
