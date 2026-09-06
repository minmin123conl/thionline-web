import { describe, it, expect } from "vitest";
import { parseExamText, parseAnswerKey, normalizeAnswer, findQuestionStarts } from "../parse-exam";

/**
 * Văn bản mẫu mô phỏng đề thi thực (đã qua OCR, có nhiễu nhẹ):
 * 2 phần, 6 câu: 3 MC4, 1 TRUE_FALSE, 2 FILL + bảng đáp án cuối đề.
 */
const EXAM = `BÀI THI THỬ
PHẦN 1: TOÁN

Câu 1. Giá trị của biểu thức 2x + 3 khi x = 4 là:
A. 10
B. 11
C. 12
D. 14

Câu 2. Giải phương trình x^2 - 4 = 0, tập nghiệm là:
A. x = 2
B. x = -2
C. x = ±2
D. x = 0

Câu 3. Một hình chữ nhật có diện tích 24 cm^2 và chiều dài 6 cm.
Chiều rộng của hình đó là:
A. 3 cm
B. 4 cm
C. 5 cm
D. 6 cm

Câu 4. Chọn câu ĐÚNG hay SAI với từng ý sau:
a) Tổng hai số chẵn luôn là số chẵn.
b) Tích hai số lẻ luôn là số chẵn.
c) Một số chia hết cho 9 thì chia hết cho 3.
d) Số 13 là số nguyên tố.

Câu 5. Điền đáp án vào chỗ trống: Giá trị của 7 × 8 bằng ....

Câu 6. Điền đáp án: log_2(8) bằng ....

PHẦN 2: TIẾNG VIỆT

ĐÁP ÁN
Câu 1 2 3 4 5 6
Đ/A B C B D S Đ S 56 3`;

describe("parseExamText", () => {
  const { questions } = parseExamText(EXAM);

  it("nhận ra 6 câu hỏi", () => {
    expect(questions).toHaveLength(6);
  });

  it("câu 1: MC4, 4 options, đáp án B từ bảng, confidence cao", () => {
    const q = questions[0];
    expect(q.type).toBe("MC4");
    expect(q.seq).toBe(1);
    expect(q.options).toHaveLength(4);
    expect(q.options?.[0]).toMatchObject({ id: "A", text: "10" });
    expect(q.answer).toBe("B");
    expect(q.confidence).toBeGreaterThanOrEqual(0.85);
    expect(q.stem).toContain("2x + 3");
    expect(q.sectionGuess).toContain("PHẦN 1");
  });

  it("câu 3: MC4 có option kèm đơn vị + đáp án B", () => {
    const q = questions[2];
    expect(q.type).toBe("MC4");
    expect(q.options?.[0].text).toBe("3 cm");
    expect(q.answer).toBe("B");
  });

  it("câu 4: TRUE_FALSE với 4 ý, đáp án [Đ,S,Đ,S] từ bảng", () => {
    const q = questions[3];
    expect(q.type).toBe("TRUE_FALSE");
    expect(q.options).toHaveLength(4);
    expect(q.options?.[0].text).toContain("chẵn");
    expect(q.options?.[3].text).toContain("nguyên tố");
    expect(q.answer).toEqual([true, false, true, false]);
    expect(q.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("câu 5,6: FILL với đáp án từ bảng (56, 3), thuộc Phần 1", () => {
    const q5 = questions[4];
    const q6 = questions[5];
    expect(q5.type).toBe("FILL");
    expect(q5.answer).toEqual(["56"]);
    expect(q6.type).toBe("FILL");
    expect(q6.answer).toEqual(["3"]);
    expect(q5.sectionGuess).toContain("PHẦN 1");
    expect(q6.sectionGuess).toContain("PHẦN 1");
  });
});

describe("parseExamText — biến thể", () => {
  it("đề không có bảng đáp án → MC4/FILL trả về answer null + warning", () => {
    const text = [
      "PHẦN I. ĐỌC HIỂU",
      "Câu 1. Từ nào là danh từ?",
      "A. Chạy",
      "B. Con sông",
      "C. Lặng lẽ",
      "D. Rất",
      "Câu 2. Điền vào chỗ trống: Trái đất quay quanh ....",
    ].join("\n");
    const { questions, warnings } = parseExamText(text);
    expect(questions).toHaveLength(2);
    expect(questions[0].type).toBe("MC4");
    expect(questions[0].answer).toBeNull();
    expect(questions[1].type).toBe("FILL");
    expect(questions[1].answer).toBeNull();
    expect(warnings.some((w) => w.includes("chưa có đáp án"))).toBe(true);
  });

  it("đáp án inline 'Đáp án: C' được dùng khi không có bảng", () => {
    const text = "Câu 1. 1 + 1 = ?\nA. 1\nB. 2\nC. 3\nD. 4\nĐáp án: B";
    const { questions } = parseExamText(text);
    expect(questions[0].answer).toBe("B");
  });

  it("chống nhầm số thứ tự trong nội dung (bước giải 1. 2. 3.)", () => {
    const text = [
      "Câu 1. Tính 12 × 5.",
      "Cách làm: 1. Lấy 12 × 5.",
      "2. Đưa kết quả ra.",
      "A. 50",
      "B. 60",
      "C. 70",
      "D. 80",
      "Câu 2. Tính 7 + 7.",
      "A. 13",
      "B. 14",
      "C. 15",
      "D. 16",
    ].join("\n");
    const { questions } = parseExamText(text);
    expect(questions).toHaveLength(2);
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].stem).toContain("Tính 12 × 5");
    // "1." "2." trong cách làm không được coi là câu mới
    expect(questions[0].stem).toContain("1. Lấy 12 × 5");
  });

  it("file rác / không có câu → questions rỗng + warning rõ", () => {
    const { questions, warnings } = parseExamText("Đây là một đoạn văn bình thường.\nKhông có gì ở đây.");
    expect(questions).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("OCR nhiễu: option viết liền dòng 'A. 10 B. 11 C. 12 D. 14' vẫn tách được", () => {
    const text = "Câu 1. 3 × 3 = ?\nA. 6 B. 9 C. 12 D. 15";
    const { questions } = parseExamText(text);
    expect(questions[0].options?.map((o) => o.text)).toEqual(["6", "9", "12", "15"]);
  });
});

describe("parseAnswerKey", () => {
  it("bảng 2 dòng Câu/Đ/A", () => {
    const key = parseAnswerKey("Câu 1 2 3\nĐ/A A B C");
    expect(key.get(1)).toBe("A");
    expect(key.get(3)).toBe("C");
  });

  it("dòng '1-A 2-B 3-C'", () => {
    const key = parseAnswerKey("1-A 2-B 3-C");
    expect(key.get(1)).toBe("A");
    expect(key.get(2)).toBe("B");
  });
});

describe("normalizeAnswer", () => {
  it("MC4: chữ cái", () => {
    expect(normalizeAnswer("MC4", "b")).toBe("B");
    expect(normalizeAnswer("MC4", "Đáp án B")).toBeNull();
  });
  it("TRUE_FALSE: D S D S và 'đúng sai đúng sai'", () => {
    expect(normalizeAnswer("TRUE_FALSE", "D S D S")).toEqual([true, false, true, false]);
    expect(normalizeAnswer("TRUE_FALSE", "Đ S Đ S")).toEqual([true, false, true, false]);
    expect(normalizeAnswer("TRUE_FALSE", "đúng, sai, đúng, sai")).toEqual([true, false, true, false]);
    expect(normalizeAnswer("TRUE_FALSE", "Đ S Đ")).toBeNull();
  });
  it("FILL: chuỗi ngắn; quá dài thì null", () => {
    expect(normalizeAnswer("FILL", "56")).toBe("56");
    expect(normalizeAnswer("FILL", "±2")).toBe("±2");
    expect(normalizeAnswer("FILL", "x".repeat(60))).toBeNull();
  });
});

describe("findQuestionStarts", () => {
  it("ưu tiên nhãn 'Câu N', fallback 'N.' chỉ khi không có nhãn", () => {
    const withLabel = findQuestionStarts("Câu 1. a\nCâu 2. b");
    expect(withLabel).toHaveLength(2);
    const plain = findQuestionStarts("1. a\n2. b\n3. c");
    expect(plain).toHaveLength(3);
  });
});
