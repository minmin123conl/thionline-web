import { NextRequest, NextResponse } from "next/server";
import { finalizeAttempt, getAttempt } from "@/lib/attempt";
import { requireUser } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const attempt = await getAttempt(params.id);
  if (!attempt || attempt.studentId !== user.id) {
    return NextResponse.json({ error: "Không tìm thấy lượt thi" }, { status: 404 });
  }
  if (attempt.status !== "ACTIVE") {
    return NextResponse.json({ ok: true, alreadySubmitted: true, attemptId: attempt.id });
  }
  await finalizeAttempt(params.id, false);
  return NextResponse.json({ ok: true, attemptId: params.id });
}
