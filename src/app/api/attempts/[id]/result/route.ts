import { NextRequest, NextResponse } from "next/server";
import { buildResult, canRevealResult, canViewAttempt, getAttempt } from "@/lib/attempt";
import { requireUser } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const attempt = await getAttempt(params.id);
  if (!attempt) return NextResponse.json({ error: "Không tìm thấy lượt thi" }, { status: 404 });
  if (!(await canViewAttempt(attempt, user))) {
    return NextResponse.json({ error: "Bạn không có quyền xem lượt thi này" }, { status: 403 });
  }

  const reveal = await canRevealResult(params.id, user);
  if (!reveal.allowed) {
    return NextResponse.json({
      error: reveal.reason,
      hidden: true,
      score: attempt.score,
      maxScore: attempt.maxScore,
      submittedAt: attempt.submittedAt,
    }, { status: 403 });
  }

  const result = await buildResult(params.id);
  return NextResponse.json(result);
}
