import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { rateLimit } from "@/lib/ratelimit";
import { checkMultiAccount, flag } from "@/lib/antifraud";
import { levelFromPlaytime } from "@/lib/levels";
import { grantGameAccess } from "@/lib/mclogin";

/**
 * Вход в игре. Плагин присылает логин, пароль и IP игрока.
 * Ответ говорит плагину, что делать: пустить, спросить 2FA или выкинуть.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, password, ip } = (await request.json()) as {
    login?: string;
    password?: string;
    ip?: string;
  };
  if (!login || !password || !ip) {
    return Response.json({ status: "error", message: "bad request" }, { status: 400 });
  }

  if (!rateLimit(`mc-login:${ip}`, 10, 3600)) {
    await db.loginAttempt.create({
      data: { login, ip, source: "game", success: false, reason: "rate_limited" },
    });
    return Response.json({ status: "rate_limited" });
  }

  const user = await db.user.findUnique({ where: { login } });
  if (!user) {
    await db.loginAttempt.create({
      data: { login, ip, source: "game", success: false, reason: "no_account" },
    });
    return Response.json({ status: "no_account" });
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await db.loginAttempt.create({
      data: { userId: user.id, login, ip, source: "game", success: false, reason: "bad_password" },
    });
    const recentFails = await db.loginAttempt.count({
      where: { login, success: false, createdAt: { gt: new Date(Date.now() - 3600_000) } },
    });
    if (recentFails >= 5) await flag(user.id, "LOGIN_BRUTE", 2, { ip, recentFails });
    return Response.json({ status: "bad_password" });
  }

  const ban = await db.punishment.findFirst({
    where: { userId: user.id, type: "BAN", active: true, expiresAt: { gt: new Date() } },
  });
  if (ban) {
    await db.loginAttempt.create({
      data: { userId: user.id, login, ip, source: "game", success: false, reason: "banned" },
    });
    return Response.json({
      status: "banned",
      reason: ban.reason,
      until: ban.expiresAt,
    });
  }

  // Бан по IP: аккаунт чистый, но с этого адреса сидит забаненный — не режем,
  // а требуем 2FA. Иначе за NAT прилетает всем соседям сразу.
  const bannedNeighbour = await db.punishment.findFirst({
    where: {
      type: "BAN",
      active: true,
      expiresAt: { gt: new Date() },
      user: { knownIps: { some: { ip } } },
      NOT: { userId: user.id },
    },
  });

  const known = await db.knownIp.findUnique({
    where: { userId_ip: { userId: user.id, ip } },
  });
  const needs2fa = !known || Boolean(bannedNeighbour);

  if (needs2fa) {
    await db.loginAttempt.create({
      data: { userId: user.id, login, ip, source: "game", success: false, reason: "2fa_required" },
    });
    if (bannedNeighbour) {
      await flag(user.id, "BANNED_IP_NEIGHBOUR", 3, { ip });
    }
    return Response.json({ status: "2fa_required" });
  }

  await grantGameAccess(user.id, user.login, ip);
  const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });

  return Response.json({
    status: "ok",
    profile: {
      login: fresh.login,
      balanceVc: fresh.balanceVc,
      level: levelFromPlaytime(fresh.playtimeSec),
      adminLevel: fresh.adminLevel,
    },
  });
}
