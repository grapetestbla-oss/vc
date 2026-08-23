import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { generateSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { audit, clientIp } from "@/lib/audit";

/** Шаг 1: выдать секрет и ссылку для приложения-аутентификатора. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.adminLevel < 3) return Response.json({ error: "Нет доступа" }, { status: 403 });
  if (user.totpEnabledAt) return Response.json({ error: "Уже подключено" }, { status: 409 });

  const secret = generateSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  await audit({ actorId: user.id, action: "panel.totp.setup", ip: clientIp(request) });

  return Response.json({ secret, otpauth: otpauthUrl(user.login, secret) });
}

/** Шаг 2: подтвердить кодом, что приложение настроено. */
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user || user.adminLevel < 3) return Response.json({ error: "Нет доступа" }, { status: 403 });
  if (!user.totpSecret) return Response.json({ error: "Сначала получите секрет" }, { status: 400 });

  const { code } = (await request.json()) as { code?: string };
  if (!code || !verifyTotp(user.totpSecret, code)) {
    return Response.json({ error: "Код не подходит" }, { status: 400 });
  }

  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
  await audit({ actorId: user.id, action: "panel.totp.enabled", ip: clientIp(request) });
  return Response.json({ ok: true });
}

/** Отключение — только с действующим кодом, иначе это дыра, а не защита. */
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user || user.adminLevel < 3) return Response.json({ error: "Нет доступа" }, { status: 403 });
  if (!user.totpSecret || !user.totpEnabledAt) {
    return Response.json({ error: "Не подключено" }, { status: 400 });
  }

  const { code } = (await request.json()) as { code?: string };
  if (!code || !verifyTotp(user.totpSecret, code)) {
    return Response.json({ error: "Код не подходит" }, { status: 400 });
  }

  await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null } });
  await audit({ actorId: user.id, action: "panel.totp.disabled", ip: clientIp(request) });
  return Response.json({ ok: true });
}
