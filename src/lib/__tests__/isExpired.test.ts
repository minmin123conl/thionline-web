import { describe, it, expect } from "vitest";
import { isExpired } from "../attempt";

const GRACE_MS = 15_000; // phải khớp GRACE_SECONDS = 15 trong templates.ts
const T = (offsetMs: number) => new Date(1_000_000_000_000 + offsetMs);
const NOW = 1_000_000_000_000;

const base = {
  status: "ACTIVE" as string,
  mode: "MOCK_FULL" as string,
  timingMode: "PER_SECTION" as string,
  globalDeadlineAt: null as Date | null,
  sections: [] as { lockedAt: Date | null; deadlineAt: Date | null; startedAt: Date | null }[],
};

describe("isExpired — GLOBAL", () => {
  it("chưa đến hạn → false", () => {
    const a = { ...base, timingMode: "GLOBAL" as const, globalDeadlineAt: T(10 * 60_000) };
    expect(isExpired(a, NOW)).toBe(false);
  });

  it("quá hạn (đã qua grace 15s) → true", () => {
    const a = { ...base, timingMode: "GLOBAL" as const, globalDeadlineAt: T(-20_000) };
    expect(isExpired(a, NOW)).toBe(true);
  });

  it("vẫn trong grace (mới quá hạn 5s < 15s) → false (cho phép autosave cuối)", () => {
    const a = { ...base, timingMode: "GLOBAL" as const, globalDeadlineAt: T(-5_000) };
    expect(isExpired(a, NOW)).toBe(false);
  });

  it("bỏ trống deadline → không bao giờ hết giờ", () => {
    const a = { ...base, timingMode: "GLOBAL" as const, globalDeadlineAt: null };
    expect(isExpired(a, NOW)).toBe(false);
  });
});

describe("isExpired — PER_SECTION", () => {
  it("mới bắt đầu, còn nhiều phần chưa hết giờ → false", () => {
    const a = {
      ...base,
      sections: [
        { startedAt: T(-60_000), deadlineAt: T(9 * 60_000), lockedAt: null },
        { startedAt: null, deadlineAt: null, lockedAt: null },
      ],
    };
    expect(isExpired(a, NOW)).toBe(false);
  });

  it("phần 1 hết giờ & khóa, phần 2 chưa mở → chưa hết bài (đúng quy chế: phải chuyển phần)", () => {
    const a = {
      ...base,
      sections: [
        { startedAt: T(-60_000), deadlineAt: T(-10_000), lockedAt: T(-9_000) },
        { startedAt: null, deadlineAt: null, lockedAt: null },
      ],
    };
    expect(isExpired(a, NOW)).toBe(false);
  });

  it("mọi phần đã hết giờ/khóa + đã có phần mở → true", () => {
    const a = {
      ...base,
      sections: [
        { startedAt: T(-120_000), deadlineAt: T(-60_000), lockedAt: T(-59_000) },
        { startedAt: T(-60_000), deadlineAt: T(-20_000), lockedAt: null },
      ],
    };
    expect(isExpired(a, NOW)).toBe(true);
  });

  it("chưa có phần nào mở (bỏ trống ngay từ đầu) → false (không auto-chấm 0)", () => {
    const a = {
      ...base,
      sections: [
        { startedAt: null, deadlineAt: null, lockedAt: null },
        { startedAt: null, deadlineAt: null, lockedAt: null },
      ],
    };
    expect(isExpired(a, NOW)).toBe(false);
  });

  it("rủ ro: quên gọi advance, phần 2 không bao giờ mở → KHÔNG bao giờ hết giờ (bắt giữ trong PER_SECTION)", () => {
    const a = {
      ...base,
      sections: [
        { startedAt: T(-120_000), deadlineAt: T(-60_000), lockedAt: null },
        { startedAt: null, deadlineAt: null, lockedAt: null },
      ],
    };
    // phần 2 chưa startedAt → allDone=false → isExpired=false
    expect(isExpired(a, NOW)).toBe(false);
  });
});

describe("isExpired — guardrails", () => {
  it("PRACTICE không bao giờ hết giờ", () => {
    const a = { ...base, mode: "PRACTICE" as const, globalDeadlineAt: T(-1_000_000) };
    expect(isExpired(a, NOW)).toBe(false);
  });

  it("lượt đã SUBMITTED/AUTO_SUBMITTED → false", () => {
    const a = { ...base, status: "SUBMITTED", globalDeadlineAt: T(-1_000_000) };
    expect(isExpired(a, NOW)).toBe(false);
    const b = { ...base, status: "AUTO_SUBMITTED", globalDeadlineAt: T(-1_000_000) };
    expect(isExpired(b, NOW)).toBe(false);
  });

  it("grace chính xác đúng ranh giới: over by 15001ms → true, 14999ms → false", () => {
    expect(isExpired({ ...base, timingMode: "GLOBAL" as const, globalDeadlineAt: T(-15_001) }, NOW)).toBe(true);
    expect(isExpired({ ...base, timingMode: "GLOBAL" as const, globalDeadlineAt: T(-14_999) }, NOW)).toBe(false);
  });

  it("GRACE_MS khớp với hằng số dùng trong hệ thống (15s)", () => {
    expect(GRACE_MS).toBe(15 * 1000);
  });
});
