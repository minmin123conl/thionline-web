import { describe, it, expect } from "vitest";
import {
  shuffle,
  questionSeed,
  normalizeFillAnswer,
  scoreQuestion,
  isCorrect,
} from "../exam-utils";

describe("mulberry32 / shuffle", () => {
  it("cùng seed → cùng thứ tự (tái hiện được)", () => {
    const a = shuffle(["q1", "q2", "q3", "q4", "q5"], 42);
    const b = shuffle(["q1", "q2", "q3", "q4", "q5"], 42);
    expect(a).toEqual(b);
  });

  it("seed khác → (gần như chắc chắn) thứ tự khác", () => {
    const a = shuffle(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"], 1);
    const b = shuffle(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"], 2);
    expect(a).not.toEqual(b);
  });

  it("shuffle là hoán vị: không mất, không lặp phần tử", () => {
    const src = Array.from({ length: 40 }, (_, i) => `q${i}`);
    const out = shuffle(src, 7);
    expect(out).toHaveLength(src.length);
    expect([...out].sort()).toEqual([...src].sort());
  });

  it("shuffle không sửa mảng gốc", () => {
    const src = ["a", "b", "c"];
    const copy = [...src];
    shuffle(src, 3);
    expect(src).toEqual(copy);
  });

  it("seed 0 vẫn chạy (khóa trộn) nhưng phải xác định", () => {
    const a = shuffle(["a", "b", "c", "d"], 0);
    const b = shuffle(["a", "b", "c", "d"], 0);
    expect(a).toEqual(b);
  });
});

describe("questionSeed", () => {
  it("cùng input → cùng seed", () => {
    expect(questionSeed(123, "abc")).toBe(questionSeed(123, "abc"));
  });

  it("câu khác → seed khác", () => {
    expect(questionSeed(123, "abc")).not.toBe(questionSeed(123, "abd"));
  });

  it("attempt seed khác → seed khác", () => {
    expect(questionSeed(123, "abc")).not.toBe(questionSeed(456, "abc"));
  });

  it("luôn là số nguyên không âm", () => {
    for (let i = 0; i < 50; i++) {
      const s = questionSeed(i, `q-${i}`);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("MC4", () => {
  const spec = JSON.stringify("B");

  it("đúng đáp án → đủ điểm", () => {
    expect(scoreQuestion("MC4", spec, JSON.stringify("B"), 1)).toBe(1);
  });

  it("sai đáp án → 0", () => {
    expect(scoreQuestion("MC4", spec, JSON.stringify("A"), 1)).toBe(0);
  });

  it("chưa trả lời (null / rỗng / 'null') → 0", () => {
    expect(scoreQuestion("MC4", spec, JSON.stringify(null), 1)).toBe(0);
    expect(scoreQuestion("MC4", spec, '""', 1)).toBe(0);
    expect(scoreQuestion("MC4", spec, "null", 1)).toBe(0);
  });

  it("trả lời dạng JSON hỏng → 0 (không crash)", () => {
    expect(scoreQuestion("MC4", spec, "B", 1)).toBe(0);
    expect(scoreQuestion("MC4", spec, "{", 1)).toBe(0);
  });

  it("chấm điểm phần tư (points=0.25)", () => {
    expect(scoreQuestion("MC4", spec, JSON.stringify("B"), 0.25)).toBe(0.25);
    expect(scoreQuestion("MC4", spec, JSON.stringify("C"), 0.25)).toBe(0);
  });

  it("KHÔNG phân biệt hoa thường của option id", () => {
    expect(scoreQuestion("MC4", spec, JSON.stringify("b"), 1)).toBe(0);
  });
});

describe("MC4 + shuffleOptions (lõi của phòng thi)", () => {
  it("học sinh trả lời theo option.id: đáp án đúng vẫn chấm đúng sau khi hiển thị bị trộn", () => {
    // Mô phỏng toClientQuestion: options được shuffle theo questionSeed nhưng giữ (id,text)
    const options = [
      { id: "A", text: "1" },
      { id: "B", text: "2" },
      { id: "C", text: "3" },
      { id: "D", text: "4" },
    ];
    const correctId = "C";
    const qid = "question-1";

    // "thể hiện" cho học sinh (mọi order đều phải giữ tính đúng/sai)
    for (const seed of [0, 1, 42, 999999]) {
      const shown = shuffle(options, questionSeed(seed, qid));
      // học sinh nhìn thấy "2" ở vị trí nào đó và chọn option có id = "C"
      const studentPicks = shown.map((o) => o.id);
      expect(studentPicks).toContain(correctId);
      expect(scoreQuestion("MC4", JSON.stringify(correctId), JSON.stringify(correctId), 1)).toBe(1);
      expect(scoreQuestion("MC4", JSON.stringify(correctId), JSON.stringify("A"), 1)).toBe(0);
    }
  });

  it("order hiển thị không ảnh hưởng kết quả chấm (chấm theo id, không theo vị trí)", () => {
    const spec = JSON.stringify("D");
    const order1 = shuffle([{ id: "A", text: "x" }, { id: "B", text: "y" }, { id: "C", text: "z" }, { id: "D", text: "w" }], 5);
    const order2 = shuffle([{ id: "A", text: "x" }, { id: "B", text: "y" }, { id: "C", text: "z" }, { id: "D", text: "w" }], 6);
    expect(order1).not.toEqual(order2);
    // cả hai "màn hình" khác nhau đều chấm như nhau theo id
    expect(scoreQuestion("MC4", spec, JSON.stringify("D"), 1)).toBe(1);
    expect(scoreQuestion("MC4", spec, JSON.stringify("B"), 1)).toBe(0);
  });
});

describe("FILL", () => {
  const spec = JSON.stringify(["42", "42,0"]);

  it("khớp đúng 1 trong các đáp án chấp nhận", () => {
    expect(scoreQuestion("FILL", spec, JSON.stringify("42"), 1)).toBe(1);
    expect(scoreQuestion("FILL", spec, JSON.stringify("42,0"), 1)).toBe(1);
  });

  it("sai → 0", () => {
    expect(scoreQuestion("FILL", spec, JSON.stringify("43"), 1)).toBe(0);
  });

  it("so sánh theo giá trị số: '0,5' = '0.5' = '0.50'", () => {
    const s = JSON.stringify(["0.5"]);
    expect(scoreQuestion("FILL", s, JSON.stringify("0,5"), 1)).toBe(1);
    expect(scoreQuestion("FILL", s, JSON.stringify("0.50"), 1)).toBe(1);
    expect(scoreQuestion("FILL", s, JSON.stringify("0.4"), 1)).toBe(0);
  });

  it("không phân biệt hoa thường & khoảng trắng thừa", () => {
    const s = JSON.stringify(["Paris"]);
    expect(scoreQuestion("FILL", s, JSON.stringify("  paris "), 1)).toBe(1);
  });

  it("chấp nhận dấu ';' / ',' cuối và '$'", () => {
    const s = JSON.stringify(["5"] );
    expect(scoreQuestion("FILL", s, JSON.stringify("5;"), 1)).toBe(1);
    expect(scoreQuestion("FILL", s, JSON.stringify("5,"), 1)).toBe(1);
    expect(scoreQuestion("FILL", s, JSON.stringify("$5"), 1)).toBe(1);
  });

  it("trả lời không phải chuỗi → 0", () => {
    expect(scoreQuestion("FILL", spec, JSON.stringify(["42"]), 1)).toBe(0);
    expect(scoreQuestion("FILL", spec, JSON.stringify(42), 1)).toBe(0);
  });

  it("chưa trả lời → 0", () => {
    expect(scoreQuestion("FILL", spec, JSON.stringify(null), 1)).toBe(0);
  });

  it("số âm và phân số thập phân", () => {
    const s = JSON.stringify(["-1.25"]);
    expect(scoreQuestion("FILL", s, JSON.stringify("-1,25"), 1)).toBe(1);
    expect(scoreQuestion("FILL", s, JSON.stringify("1.25"), 1)).toBe(0);
  });
});

describe("TRUE_FALSE", () => {
  const spec = JSON.stringify([true, false, true, false]);

  it("đúng cả 4 ý → đủ điểm", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify([true, false, true, false]), 1)).toBe(1);
  });

  it("chấm từng ý: đúng 3/4 → 0.75 điểm câu", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify([true, false, true, true]), 1)).toBeCloseTo(0.75);
  });

  it("đúng 1/4 → 0.25", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify([true, true, false, true]), 1)).toBeCloseTo(0.25);
  });

  it("sai cả 4 → 0", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify([false, true, false, true]), 1)).toBe(0);
  });

  it("bỏ 1 ý (mảng ngắn hơn) → các ý còn lại vẫn chấm, ý thiếu = sai", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify([true, false]), 1)).toBeCloseTo(0.5);
  });

  it("trả lời không phải mảng → 0", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify("true"), 1)).toBe(0);
  });

  it("chưa trả lời → 0", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify(null), 1)).toBe(0);
  });

  it("points không chia đều vẫn đúng tỉ lệ", () => {
    expect(scoreQuestion("TRUE_FALSE", spec, JSON.stringify([true, false, true, true]), 4)).toBeCloseTo(3);
  });
});

describe("isCorrect", () => {
  it("đúng cả câu → true; đúng một phần → false", () => {
    const tf = JSON.stringify([true, false, true, false]);
    expect(isCorrect("TRUE_FALSE", tf, JSON.stringify([true, false, true, false]))).toBe(true);
    expect(isCorrect("TRUE_FALSE", tf, JSON.stringify([true, false, true, true]))).toBe(false);
    expect(isCorrect("MC4", JSON.stringify("A"), JSON.stringify("A"))).toBe(true);
    expect(isCorrect("MC4", JSON.stringify("A"), JSON.stringify("B"))).toBe(false);
    expect(isCorrect("FILL", JSON.stringify(["7"]), JSON.stringify("7"))).toBe(true);
    expect(isCorrect("FILL", JSON.stringify(["7"]), JSON.stringify("8"))).toBe(false);
  });
});

describe("normalizeFillAnswer", () => {
  it("trim + lowercase + gộp khoảng trắng", () => {
    expect(normalizeFillAnswer("  Hello   World ")).toBe("hello world");
  });
  it("bỏ dấu ','/';' cuối", () => {
    expect(normalizeFillAnswer("42,")).toBe("42");
    expect(normalizeFillAnswer("42;")).toBe("42");
  });
  it("bỏ $", () => {
    expect(normalizeFillAnswer("$5.5$")).toBe("5.5");
  });
});
