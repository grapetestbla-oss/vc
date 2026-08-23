import { db } from "./db";
import type { Prisma } from "@prisma/client";

/** Заводит подозрительное срабатывание, если такого же свежего ещё нет. */
export async function flag(
  userId: string,
  kind: string,
  severity: number,
  details?: Prisma.InputJsonValue,
) {
  const recent = await db.suspiciousFlag.findFirst({
    where: {
      userId,
      kind,
      resolved: false,
      createdAt: { gt: new Date(Date.now() - 3600_000) },
    },
  });
  if (recent) return;
  await db.suspiciousFlag.create({ data: { userId, kind, severity, details } });
}

/** Другие аккаунты, заходившие с этого же IP. */
export async function accountsSharingIp(ip: string, exceptUserId?: string) {
  const rows = await db.knownIp.findMany({
    where: { ip, ...(exceptUserId ? { userId: { not: exceptUserId } } : {}) },
    include: { user: { select: { id: true, login: true, adminLevel: true } } },
    take: 50,
  });
  return rows.map((row) => row.user);
}

/** Вызывается после входа: мультиаккаунт по IP — повод присмотреться. */
export async function checkMultiAccount(userId: string, ip: string) {
  const others = await accountsSharingIp(ip, userId);
  if (others.length >= 2) {
    await flag(userId, "MULTI_ACCOUNT_IP", others.length >= 4 ? 3 : 2, {
      ip,
      accounts: others.map((o) => o.login),
    });
  }
}

/** Аномальный выигрыш: игрок в плюсе больше порога за сутки. */
export async function checkGameAnomaly(userId: string) {
  const since = new Date(Date.now() - 86_400_000);
  const rounds = await db.gameRound.findMany({
    where: { userId, createdAt: { gt: since } },
    select: { betVc: true, payoutVc: true },
  });
  if (rounds.length < 20) return;
  const net = rounds.reduce((sum, r) => sum + r.payoutVc - r.betVc, 0);
  const wagered = rounds.reduce((sum, r) => sum + r.betVc, 0);
  if (wagered > 0 && net > wagered * 0.5 && net > 10_000) {
    await flag(userId, "GAME_ANOMALY", 3, { rounds: rounds.length, net, wagered });
  }
}
