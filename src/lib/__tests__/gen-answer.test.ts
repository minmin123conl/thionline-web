import { describe, expect, it } from "vitest";
import { coerceGenAnswer } from "../ai";

describe("coerceGenAnswer — MC4", () => {
  it("chấp nhận chữ cái hợp lệ (kể cả chữ thường)", () => {
    expect(coerceGenAnswer("MC4", "b")).toBe("B");
    expect(coerceGenAnswer("MC4", " D ")).toBe("D");
  });
  it("bác chữ ngoài A–D, kiểu sai, null", () => {
    expect(coerceGenAnswer("MC4", "E")).toBeNull();
    expect(coerceGenAnswer("MC4", "1")).toBeNull();
    expect(coerceGenAnswer("MC4", ["A"])).toBeNull();
    expect(coerceGenAnswer("MC4", null)).toBeNull();
  });
});

describe("coerceGenAnswer — FILL", () => {
  it("bọc số/ chuỗi thành mảng 1 phần tử", () => {
    expect(coerceGenAnswer("FILL", 56)).toEqual(["56"]);
    expect(coerceGenAnswer("FILL", " 42 ")).toEqual(["42"]);
  });
  it("chấp nhận mảng nhiều giá trị hợp lệ", () => {
    expect(coerceGenAnswer("FILL", ["a", "b"])).toEqual(["a", "b"]);
  });
  it("bác rỗng và kiểu lạ", () => {
    expect(coerceGenAnswer("FILL", "   ")).toBeNull();
    expect(coerceGenAnswer("FILL", true)).toBeNull();
    expect(coerceGenAnswer("FILL", [])).toBeNull();
  });
});

describe("coerceGenAnswer — TRUE_FALSE", () => {
  it("bắt buộc đúng 4 giá trị boolean", () => {
    expect(coerceGenAnswer("TRUE_FALSE", [true, false, true, false])).toEqual([true, false, true, false]);
  });
  it("convert chuỗi đúng/sai, độ dài sai → null", () => {
    expect(coerceGenAnswer("TRUE_FALSE", ["đúng", "sai", "Đ", false])).toEqual([true, false, true, false]);
    expect(coerceGenAnswer("TRUE_FALSE", [true, false, true])).toBeNull();
    expect(coerceGenAnswer("TRUE_FALSE", ["x", false, true, false])).toBeNull();
    expect(coerceGenAnswer("TRUE_FALSE", "ĐĐĐĐ")).toBeNull();
  });
});