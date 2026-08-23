import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { currentSessionToken, markPanelVerified, PANEL_SESSION_MINUTES } from "@/lib/panel";
import { verifyTotp } from "@/lib/totp";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

/** Вход в панель: пароль ещё раз плюс TOTP, если он привязан. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Сначала войдите на сайт" }, { status: 401 });
  if (user.adminLevel < 3) return Response.json({ error: "Нет доступа" }, { status: 403 });

  const ip = clientIp(request);
  if (!rateLimit(`panel-verify:${user.id}`, 10, 900)) {
    return Response.json({ error: "Слишком много попыток" }, { status: 429 });
  }

  const { password, code } = (await request.json()) as { password?: string; code?: string };
  if (!password) return Response.json({ error: "Введите пароль" }, { status: 400 });

  if (!(await verifyPassword(user.passwordHash, password))) {
    await db.loginAttempt.create({
      data: { userId: user.id, login: user.login, ip, source: "panel", success: false, reason: "bad_password" },
    });
    await audit({ actorId: user.id, action: "panel.verify.failed", ip, meta: { reason: "bad_password" } });
    return Response.json({ error: "Неверный пароль" }, { status: 401 });
  }

  if (user.totpSecret && user.totpEnabledAt) {
    if (!code || !verifyTotp(user.totpSecret, code)) {
      await db.loginAttempt.create({
        data: { userId: user.id, login: user.login, ip, source: "panel", success: false, reason: "bad_totp" },
      });
      await audit({ actorId: user.id, action: "panel.verify.failed", ip, meta: { reason: "bad_totp" } });
      return Response.json({ error: "Неверный код из приложения" }, { status: 401 });
    }
  }

  const token = await currentSessionToken();
  if (!token) return Response.json({ error: "Сессия потеряна" }, { status: 401 });
  await markPanelVerified(token);

  await db.loginAttempt.create({
    data: { userId: user.id, login: user.login, ip, source: "panel", success: true },
  });
  await audit({ actorId: user.id, action: "panel.verify.ok", ip, meta: { minutes: PANEL_SESSION_MINUTES } });

  return Response.json({ ok: true, totpRequired: Boolean(user.totpEnabledAt) });
}
