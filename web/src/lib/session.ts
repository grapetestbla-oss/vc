import { cookies } from "next/headers";
import { db } from "./db";
import { randomToken } from "./auth";
import type { User } from "@prisma/client";

const COOKIE = "vc_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 14;

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const token = randomToken();
  await db.session.create({
    data: { userId, token, ip, userAgent, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
  return token;
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
    jar.delete(COOKIE);
  }
}

/** Доступ в админ-панель. Возвращает пользователя или null. */
export async function requireAdmin(minLevel = 3): Promise<User | null> {
  const user = await currentUser();
  if (!user || user.adminLevel < minLevel) return null;
  return user;
}
