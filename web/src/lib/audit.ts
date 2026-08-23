import { db } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * Пишет действие в журнал. Вызывается на КАЖДОЕ действие админки,
 * включая просмотр карточки игрока — иначе панель невозможно контролировать.
 */
export async function audit(entry: {
  actorId?: string | null;
  action: string;
  targetUserId?: string | null;
  ip?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      ip: entry.ip ?? null,
      meta: entry.meta,
    },
  });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}
