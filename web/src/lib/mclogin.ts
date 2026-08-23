import { db } from "./db";
import { checkMultiAccount } from "./antifraud";

/** Успешный вход в игре: запоминаем IP, отмечаем визит, ищем мультиаккаунты. */
export async function grantGameAccess(userId: string, login: string, ip: string) {
  await db.$transaction([
    db.knownIp.upsert({
      where: { userId_ip: { userId, ip } },
      create: { userId, ip },
      update: { lastSeen: new Date(), hits: { increment: 1 } },
    }),
    db.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date(), lastIp: ip },
    }),
    db.loginAttempt.create({
      data: { userId, login, ip, source: "game", success: true },
    }),
  ]);
  await checkMultiAccount(userId, ip);
}
