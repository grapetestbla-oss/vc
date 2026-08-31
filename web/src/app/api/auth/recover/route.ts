import { LOGIN_RE } from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { db } from "@/lib/db";
import { requestReset, resetPassword } from "@/lib/recovery";

/**
 * Заявка на восстановление и сама смена пароля.
 *
 * Ответ на заявку всегда одинаковый: по нему нельзя перебрать, какие логины
 * существуют и у кого привязан Telegram.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const body = (await request.json().catch(() => ({}))) as {
    login?: string;
    code?: string;
    password?: string;
  };

  const login = (body.login ?? "").trim();
  if (!LOGIN_RE.test(login)) {
    return Response.json({ error: "Проверьте логин" }, { status: 400 });
  }

  // Смена пароля по коду.
  if (body.code) {
    if (!rateLimit(`recover-confirm:${ip}`, 10, 600)) {
      return Response.json({ error: "Слишком много попыток, подождите" }, { status: 429 });
    }
    const result = await resetPassword(login, body.code.trim(), body.password ?? "");
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

    const user = await db.user.findUnique({ where: { login }, select: { id: true } });
    if (user) {
      await audit({ actorId: user.id, action: "auth.password.reset", ip, targetUserId: user.id });
    }
    return Response.json({ ok: true });
  }

  // Заявка: код уходит в Telegram.
  if (!rateLimit(`recover:${ip}`, 5, 600) || !rateLimit(`recover-login:${login}`, 5, 600)) {
    return Response.json({ error: "Слишком много запросов, подождите" }, { status: 429 });
  }
  await requestReset(login);
  return Response.json({ ok: true, sent: true });
}
