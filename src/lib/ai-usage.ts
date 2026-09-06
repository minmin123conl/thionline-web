import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { documents, exams } from "./db/schema";

export type DocumentAiPurpose = "extraction" | "answer";

/** Atomically reserves one document AI call, preventing concurrent quota bypasses. */
export async function reserveDocumentAiCall(documentId: string, purpose: DocumentAiPurpose, limit: number) {
  const purposeColumn = purpose === "extraction" ? documents.aiExtractionCalls : documents.aiAnswerCalls;
  const rows = await db
    .update(documents)
    .set({
      aiCalls: sql`${documents.aiCalls} + 1`,
      [purpose === "extraction" ? "aiExtractionCalls" : "aiAnswerCalls"]: sql`${purposeColumn} + 1`,
    })
    .where(and(eq(documents.id, documentId), sql`${documents.aiCalls} < ${limit}`, sql`${purposeColumn} < ${limit}`))
    .returning({ aiCalls: documents.aiCalls });
  return rows[0]?.aiCalls ?? null;
}

/** Atomically reserves an explanation call for an exam. */
export async function reserveExamExplanationCall(examId: string, limit: number) {
  const rows = await db
    .update(exams)
    .set({ aiExplanationCalls: sql`${exams.aiExplanationCalls} + 1` })
    .where(and(eq(exams.id, examId), sql`${exams.aiExplanationCalls} < ${limit}`))
    .returning({ aiExplanationCalls: exams.aiExplanationCalls });
  return rows[0]?.aiExplanationCalls ?? null;
}

/** Hoàn lại lượt AI đã reserve khi lời gọi Gemini thất bại (không tiêu quota oan). */
export async function releaseDocumentAiCall(documentId: string, purpose: DocumentAiPurpose) {
  const purposeColumn = purpose === "extraction" ? documents.aiExtractionCalls : documents.aiAnswerCalls;
  await db
    .update(documents)
    .set({
      aiCalls: sql`GREATEST(${documents.aiCalls} - 1, 0)`,
      [purpose === "extraction" ? "aiExtractionCalls" : "aiAnswerCalls"]: sql`GREATEST(${purposeColumn} - 1, 0)`,
    })
    .where(eq(documents.id, documentId));
}

/** Hoàn lại lượt sinh giải thích đã reserve khi lời gọi Gemini thất bại. */
export async function releaseExamExplanationCall(examId: string) {
  await db
    .update(exams)
    .set({ aiExplanationCalls: sql`GREATEST(${exams.aiExplanationCalls} - 1, 0)` })
    .where(eq(exams.id, examId));
}
