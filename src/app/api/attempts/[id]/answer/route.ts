import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveAnswer } from "@/lib/attempt";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  questionId: z.string(),
  clientSeq: z.number().int().min(0),
  answer: z.unknown(),
  timeSpentMs: z.number().int().min(0).max(86_400_000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });

  const res = await saveAnswer({
    attemptId: params.id,
    studentId: user.id,
    questionId: parsed.data.questionId,
    clientSeq: parsed.data.clientSeq,
    answer: parsed.data.answer,
    timeSpentMs: parsed.data.timeSpentMs,
  });
  if (!res.ok) {
    const status = res.code === "SUBMITTED" || res.code === "EXPIRED" || res.code === "LOCKED" ? 409 : 400;
    return NextResponse.json(res, { status });
  }
  return NextResponse.json(res);
}
