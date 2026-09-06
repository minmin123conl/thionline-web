/** Thuật toán thi cử: shuffle có seed, chuẩn hóa & chấm đáp án — tất cả chạy server-side */

// PRNG có seed (mulberry32) — tái hiện được thứ tự trộn từ seed lưu trong attempt
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seed phụ cho từng câu để trộn lựa chọn (không ảnh hưởng seed chính) */
export function questionSeed(attemptSeed: number, questionId: string): number {
  let h = attemptSeed;
  for (let i = 0; i < questionId.length; i++) h = (Math.imul(h, 31) + questionId.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function normalizeFillAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[,;]$/, "")
    .replace(/\$/g, "");
}

function numericValue(s: string): number | null {
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
  return null;
}

/** Chấm 1 câu. Trả về điểm đạt được (0..points) */
export function scoreQuestion(
  type: string,
  answerSpec: string,
  studentAnswer: string,
  points: number
): number {
  if (!studentAnswer || studentAnswer === '""' || studentAnswer === "null") return 0;
  let student: unknown;
  try {
    student = JSON.parse(studentAnswer);
  } catch {
    return 0;
  }

  switch (type) {
    case "MC4": {
      // answerSpec: JSON string của optionId đúng, vd "\"B\""
      let correct: string;
      try {
        correct = JSON.parse(answerSpec);
      } catch {
        correct = answerSpec;
      }
      return student === correct ? points : 0;
    }
    case "FILL": {
      let accepted: string[];
      try {
        accepted = JSON.parse(answerSpec);
      } catch {
        accepted = [answerSpec];
      }
      if (typeof student !== "string") return 0;
      const norm = normalizeFillAnswer(student);
      const studentNum = numericValue(norm);
      for (const a of accepted) {
        const an = normalizeFillAnswer(a);
        if (!an) continue;
        if (an === norm) return points;
        const num = numericValue(an);
        if (num !== null && studentNum !== null && Math.abs(num - studentNum) < 1e-6) return points;
      }
      return 0;
    }
    case "TRUE_FALSE": {
      let correct: boolean[];
      try {
        correct = JSON.parse(answerSpec);
      } catch {
        return 0;
      }
      if (!Array.isArray(student)) return 0;
      const perItem = points / Math.max(correct.length, 1);
      let earned = 0;
      for (let i = 0; i < correct.length; i++) {
        if (student[i] === correct[i]) earned += perItem;
      }
      return earned;
    }
    default:
      return 0;
  }
}

export function isCorrect(type: string, answerSpec: string, studentAnswer: string): boolean {
  return scoreQuestion(type, answerSpec, studentAnswer, 1) >= 0.999;
}
