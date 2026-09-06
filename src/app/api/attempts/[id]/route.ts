import { NextRequest, NextResponse } from "next/server";
import { getAttemptState } from "@/lib/attempt";
import { requireUser } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  try {
    const state = await getAttemptState(params.id, user.id);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
