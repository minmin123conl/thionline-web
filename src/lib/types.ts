/** Kiểu dùng chung cả server lẫn client — để client bundle không phải kéo theo tầng gọi AI */
export type ExtractedQuestion = {
  seq: number;
  type: "MC4" | "FILL" | "TRUE_FALSE";
  stem: string;
  options?: { id: string; text: string }[];
  // null = chưa có đáp án (giáo viên nhập tay khi duyệt, hoặc AI tự sinh)
  answer?: string | string[] | boolean[] | null;
  explanation?: string;
  sectionGuess?: string;
  confidence: number;
  sourceSnippet?: string;
};

export type ExtractedItem = {
  id: string;
  seq: number;
  status: "PENDING" | "APPROVED" | "EDITED" | "REJECTED";
  confidence: number;
  payload: ExtractedQuestion;
};
