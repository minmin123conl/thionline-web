import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import { normalizeLoginEmail } from "./constants";

const COOKIE_NAME = "session";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
};

export async function createSession(user: SessionUser, maxAgeDays = 7) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeDays}d`)
    .sign(secretKey());
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeDays * 86400,
    path: "/",
  });
}

export function destroySession() {
  cookies().delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  const rows = await db.select().from(users).where(eq(users.id, user.id));
  const dbUser = rows[0];
  if (!dbUser) throw new Response("Unauthorized", { status: 401 });
  return { ...user, role: dbUser.role as SessionUser["role"], name: dbUser.name };
}

export async function requireRole(...roles: SessionUser["role"][]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const rows = await db.select().from(users).where(eq(users.email, normalizeLoginEmail(email)));
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as SessionUser["role"],
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

/** Giáo viên chỉ quản lý đề của chính mình; quản trị viên quản lý tất cả */
export function canManageExam(user: SessionUser, exam: { teacherId: string | null }): boolean {
  return user.role === "ADMIN" || exam.teacherId === user.id;
}
