import { cookies } from "next/headers";
import { db } from "./db";
import { levelHas } from "./ranks";
import type { User } from "@prisma/client";

/** Сколько живёт подтверждённый доступ в панель. */
export const PANEL_SESSION_MINUTES = 720;

const COOKIE = "vc_session";

export type PanelAccess =
  | { ok: true; user: User }
  | { ok: false; reason: "anonymous" | "not_staff" | "needs_verify" };

/**
 * Доступ в панель. Обычной сессии сайта мало: нужен отдельный вход по паролю
 * (и TOTP, если он привязан), который живёт 12 часов. Так угнанная cookie с
 * форума не открывает панель с банами и балансами.
 */
export async function panelAccess(minLevel = 3, permission?: string): Promise<PanelAccess> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return { ok: false, reason: "anonymous" };

  const session = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return { ok: false, reason: "anonymous" };
  // Уровень — минимальная планка, право — точная. Пока ранги не правили,
  // право совпадает с прежним уровнем, поэтому поведение не меняется.
  if (session.user.adminLevel < minLevel) return { ok: false, reason: "not_staff" };
  if (permission && !(await levelHas(session.user.adminLevel, permission))) {
    return { ok: false, reason: "not_staff" };
  }
  if (!session.panelVerifiedUntil || session.panelVerifiedUntil < new Date()) {
    return { ok: false, reason: "needs_verify" };
  }
  return { ok: true, user: session.user };
}

/** Для API панели: возвращает пользователя или null. */
export async function requirePanel(minLevel = 3, permission?: string): Promise<User | null> {
  const access = await panelAccess(minLevel, permission);
  return access.ok ? access.user : null;
}

export async function markPanelVerified(token: string) {
  await db.session.update({
    where: { token },
    data: { panelVerifiedUntil: new Date(Date.now() + PANEL_SESSION_MINUTES * 60_000) },
  });
}

export async function currentSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}
