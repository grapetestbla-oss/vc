import { hash, verify } from "@node-rs/argon2";
import { randomInt, randomBytes, timingSafeEqual } from "node:crypto";

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password, ARGON);
  } catch {
    return false;
  }
}

export function generate2faCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Сравнение без утечки времени — для токенов и кодов 2FA. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const LOGIN_RE = /^[A-Za-z0-9_]{3,16}$/;

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Пароль короче 8 символов";
  if (password.length > 128) return "Пароль длиннее 128 символов";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Пароль должен содержать буквы и цифры";
  }
  return null;
}
