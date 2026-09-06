import { NextRequest, NextResponse } from "next/server";
import { advanceSection } from "@/lib/attempt";
import { requireUser } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const res = await advanceSection(params.id, user.id);
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
