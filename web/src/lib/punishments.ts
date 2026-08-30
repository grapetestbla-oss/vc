import { db } from "./db";
import { audit } from "./audit";
import type { Punishment, PunishmentType } from "@prisma/client";

export const WARN_DAYS = 7;
export const WARN_TO_BAN_DAYS = 5;
export const HELPER_JAIL_LIMIT_MINUTES = 60;

/**
 * Ход срока: минута заключения стоит десяти реальных минут. Отсидеться дорого
 * специально — быстрее выйти работой у прораба, каждый наряд снимает минуту.
 */
export const JAIL_REAL_PER_MINUTE = 10;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

export async function issueJail(params: {
  userId: string;
  byUserId: string | null;
  reason: string;
  minutes: number;
}): Promise<Punishment> {
  const seconds = Math.round(params.minutes * 60);
  const punishment = await db.punishment.create({
    data: {
      type: "JAIL",
      userId: params.userId,
      byUserId: params.byUserId,
      reason: params.reason,
      totalSeconds: seconds,
      remainingSeconds: seconds,
      blocksMined: 0,
    },
  });
  await audit({
    actorId: params.byUserId,
    action: "punish.jail",
    targetUserId: params.userId,
    meta: { minutes: params.minutes, reason: params.reason },
  });
  return punishment;
}

/**
 * Варн живёт 7 дней. Второй активный варн автоматически превращается в бан:
 * так игрок видит понятную лестницу, а админам не нужно считать вручную.
 */
export async function issueWarn(params: {
  userId: string;
  byUserId: string | null;
  reason: string;
}): Promise<{ warn: Punishment; ban: Punishment | null }> {
  const warn = await db.punishment.create({
    data: {
      type: "WARN",
      userId: params.userId,
      byUserId: params.byUserId,
      reason: params.reason,
      expiresAt: daysFromNow(WARN_DAYS),
    },
  });
  await audit({
    actorId: params.byUserId,
    action: "punish.warn",
    targetUserId: params.userId,
    meta: { reason: params.reason },
  });

  const activeWarns = await db.punishment.count({
    where: { userId: params.userId, type: "WARN", active: true, expiresAt: { gt: new Date() } },
  });

  let ban: Punishment | null = null;
  if (activeWarns >= 2) {
    ban = await issueBan({
      userId: params.userId,
      byUserId: params.byUserId,
      reason: `Автоматически: ${activeWarns} активных варна`,
      days: WARN_TO_BAN_DAYS,
    });
  }
  return { warn, ban };
}

export async function issueBan(params: {
  userId: string;
  byUserId: string | null;
  reason: string;
  days: number;
}): Promise<Punishment> {
  const ban = await db.punishment.create({
    data: {
      type: "BAN",
      userId: params.userId,
      byUserId: params.byUserId,
      reason: params.reason,
      expiresAt: daysFromNow(params.days),
    },
  });
  await audit({
    actorId: params.byUserId,
    action: "punish.ban",
    targetUserId: params.userId,
    meta: { days: params.days, reason: params.reason },
  });
  return ban;
}

/** Кто может снять наказание. Бан — только чиф, остальное — с хелпера. */
export function canLift(adminLevel: number, type: PunishmentType): string | null {
  if (type === "BAN") return adminLevel >= 5 ? null : "Бан снимает только чиф-администратор";
  return adminLevel >= 2 ? null : "Нужен уровень helper";
}

/**
 * Досрочный выпуск из деморгана. Возвращает снятое наказание или null, если
 * игрок и так на свободе — чтобы команда в игре сказала об этом человеческим
 * текстом, а не молча ничего не сделала.
 */
export async function liftJail(params: {
  userId: string;
  byUserId: string | null;
}): Promise<Punishment | null> {
  const jail = await db.punishment.findFirst({
    where: { userId: params.userId, type: "JAIL", active: true },
    orderBy: { issuedAt: "desc" },
  });
  if (!jail) return null;
  return liftPunishment(jail.id, params.byUserId);
}

export async function liftPunishment(id: string, byUserId: string | null) {
  const punishment = await db.punishment.update({
    where: { id },
    data: { active: false, liftedAt: new Date(), liftedBy: byUserId },
  });
  await audit({
    actorId: byUserId,
    action: "punish.lift",
    targetUserId: punishment.userId,
    meta: { type: punishment.type, id },
  });
  return punishment;
}

/** Гасит истёкшие варны и баны. Вызывается перед выдачей и из плагина. */
export async function expirePunishments() {
  await db.punishment.updateMany({
    where: { active: true, expiresAt: { lt: new Date() } },
    data: { active: false },
  });
}

/** Может ли админ такого уровня выдать такое наказание. */
export function canPunish(
  adminLevel: number,
  type: "JAIL" | "WARN" | "BAN",
  minutes?: number,
): string | null {
  if (type === "JAIL") {
    if (adminLevel < 2) return "Нужен уровень helper";
    if (adminLevel === 2 && (minutes ?? 0) > HELPER_JAIL_LIMIT_MINUTES) {
      return `Helper может выдать максимум ${HELPER_JAIL_LIMIT_MINUTES} минут`;
    }
    return null;
  }
  if (adminLevel < 3) return "Нужен уровень administrator";
  return null;
}
