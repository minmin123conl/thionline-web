import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyCredentials } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().min(3).max(200), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không hợp lệ" }, { status: 400 });
  }

  // Chống brute-force: 10 lần sai / 15 phút theo email + IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [okEmail, okIp] = await Promise.all([
    checkRateLimit(`login:email:${parsed.data.email.toLowerCase()}`, 10, 15 * 60_000),
    checkRateLimit(`login:ip:${ip}`, 30, 15 * 60_000),
  ]);
  if (!okEmail || !okIp) {
    return NextResponse.json({ error: "Thử lại sau — quá nhiều lần đăng nhập" }, { status: 429 });
  }

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Sai email hoặc mật khẩu" }, { status: 401 });
  }
  await createSession(user);
  const home = user.role === "ADMIN" ? "/admin" : user.role === "TEACHER" ? "/giao-vien" : "/hoc-sinh";
  return NextResponse.json({ ok: true, redirect: home });
}
