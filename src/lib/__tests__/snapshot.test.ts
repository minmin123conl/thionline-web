import { describe, it, expect } from "vitest";
import { buildSnapshot } from "../snapshot";
import { nextChunk } from "../extract";

const exam = {
  id: "e1",
  title: "Đề HSA",
  description: "d",
  templateCode: "hsa",
  totalMinutes: 120,
  shuffleQuestions: true,
  shuffleOptions: true,
  revealResult: "IMMEDIATE",
};

const sections = [
  { id: "s2", examId: "e1", code: "B", title: "Phần 2", position: 2, minutes: 60 } as never,
  { id: "s1", examId: "e1", code: "A", title: "Phần 1", position: 1, minutes: 40 } as never,
];

const questions = [
  {
    id: "q1", examId: "e1", sectionId: "s1", position: 2, type: "MC4", stem: "c2",
    options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], answer: "B",
    explanation: "x", points: 1, isTrial: false,
  } as never,
  {
    id: "q2", examId: "e1", sectionId: "s1", position: 1, type: "FILL", stem: "c1",
    options: [], answer: ["42"], explanation: "", points: 2, isTrial: false,
  } as never,
  {
    id: "q3", examId: "e1", sectionId: "s2", position: 1, type: "TRUE_FALSE", stem: "c3",
    options: [{ id: "a", text: "1" }, { id: "b", text: "2" }, { id: "c", text: "3" }, { id: "d", text: "4" }],
    answer: [true, false, true, false], explanation: "", points: 1, isTrial: true,
  } as never,
];

describe("buildSnapshot", () => {
  it("sắp xếp sections & questions theo position (bất kể thứ tự đầu vào)", () => {
    const snap = buildSnapshot(exam, sections, questions);
    expect(snap.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(snap.questions.filter((q) => q.sectionId === "s1").map((q) => q.id)).toEqual(["q2", "q1"]);
  });

  it("chứa đầy đủ nội dung cần chấm & hiển thị, không thiếu trường", () => {
    const snap = buildSnapshot(exam, sections, questions);
    const q = snap.questions.find((x) => x.id === "q1")!;
    expect(q).toMatchObject({
      sectionId: "s1", type: "MC4", stem: "c2", answer: "B", points: 1, isTrial: false, explanation: "x",
    });
    expect(q.options).toEqual([{ id: "A", text: "a" }, { id: "B", text: "b" }]);
    expect(snap.exam).toMatchObject({ id: "e1", title: "Đề HSA", templateCode: "hsa", shuffleQuestions: true, shuffleOptions: true });
  });

  it("options rỗng khi câu không có options; answer null khi chưa có", () => {
    const qs = [
      {
        id: "q4", examId: "e1", sectionId: "s1", position: 1, type: "FILL", stem: "c4",
        options: [], answer: null, explanation: "", points: 1, isTrial: false,
      },
    ] as never[];
    const snap = buildSnapshot(exam, sections, qs);
    expect(snap.questions[0].options).toEqual([]);
    expect(snap.questions[0].answer).toBeNull();
  });

  it("snapshot ổn định (JSON round-trip giữ nguyên)", () => {
    const snap = buildSnapshot(exam, sections, questions);
    const restored = JSON.parse(JSON.stringify(snap));
    expect(restored).toEqual(snap);
  });
});

describe("nextChunk", () => {
  it("trả về rỗng khi cursor đã đến hết text", () => {
    expect(nextChunk("abc", 3)).toBe("");
    expect(nextChunk("abc", 100)).toBe("");
  });

  it("cắt đúng cursor và không vượt quá CHUNK (9000)", () => {
    const text = "x".repeat(20000);
    const chunk = nextChunk(text, 0);
    expect(chunk.length).toBeLessThanOrEqual(9000);
    expect(chunk.length).toBeGreaterThan(0);
    expect(text.startsWith(chunk)).toBe(true);
  });

  it("ưu tiên đứt ở ranh giới 'Câu N' để không xé câu giữa chừng", () => {
    // Nhiều câu, mỗi câu ~1000 ký tự → tổng vượt CHUNK (9000).
    // Logic nên cắt ngay trước một "Câu N" (ranh giới sạch), không xé câu nửa chừng.
    const q = (n: number) => `Câu ${n}: ${"x".repeat(990)}\n`;
    const text = Array.from({ length: 20 }, (_, i) => q(i + 1)).join("");
    const chunk = nextChunk(text, 0);
    expect(chunk.length).toBeGreaterThan(500);
    expect(chunk.length).toBeLessThanOrEqual(9000);
    // Vị trí cắt phải rơi đúng vào đầu một câu mới (không nằm giữa nội dung câu)
    expect(text.slice(chunk.length).startsWith("Câu ")).toBe(true);
  });
});
