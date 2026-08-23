import { db } from "@/lib/db";
import { safeEqual } from "@/lib/auth";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { grantGameAccess } from "@/lib/mclogin";
import { levelFromPlaytime } from "@/lib/levels";
import { rateLimit } from "@/lib/ratelimit";

/** Подтверждение входа кодом из личного кабинета. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, code, ip } = (await request.json()) as {
    login?: string;
    code?: string;
    ip?: string;
  };
  if (!login || !code || !ip) {
    return Response.json({ status: "error" }, { status: 400 });
  }
  if (!rateLimit(`mc-2fa:${login}`, 8, 900)) {
    return Response.json({ status: "rate_limited" });
  }

  const user = await db.user.findUnique({ where: { login } });
  if (!user || !user.twoFactorCode || !user.twoFactorExpiresAt) {
    return Response.json({ status: "no_code" });
  }
  if (user.twoFactorExpiresAt < new Date()) {
    return Response.json({ status: "expired" });
  }
  if (!safeEqual(user.twoFactorCode, code)) {
    await db.loginAttempt.create({
      data: { userId: user.id, login, ip, source: "game", success: false, reason: "bad_2fa" },
    });
    return Response.json({ status: "bad_code" });
  }

  await db.user.update({
    where: { id: user.id },
    data: { twoFactorCode: null, twoFactorExpiresAt: null },
  });
  await grantGameAccess(user.id, user.login, ip);

  return Response.json({
    status: "ok",
    profile: {
      login: user.login,
      balanceVc: user.balanceVc,
      level: levelFromPlaytime(user.playtimeSec),
      adminLevel: user.adminLevel,
    },
  });
}
