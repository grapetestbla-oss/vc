import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`web-login:${ip}`, 15, 900)) {
    return Response.json({ error: "Слишком много попыток" }, { status: 429 });
  }

  const { login, password } = (await request.json()) as { login?: string; password?: string };
  if (!login || !password) return Response.json({ error: "Заполните поля" }, { status: 400 });

  const user = await db.user.findUnique({ where: { login } });
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;

  await db.loginAttempt.create({
    data: {
      userId: user?.id ?? null,
      login,
      ip,
      source: "web",
      success: ok,
      reason: ok ? null : user ? "bad_password" : "no_account",
    },
  });

  if (!ok || !user) {
    return Response.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  await createSession(user.id, ip, request.headers.get("user-agent") ?? undefined);
  await db.knownIp.upsert({
    where: { userId_ip: { userId: user.id, ip } },
    create: { userId: user.id, ip },
    update: { lastSeen: new Date(), hits: { increment: 1 } },
  });
  await audit({ actorId: user.id, action: "account.login", ip });

  return Response.json({ ok: true, adminLevel: user.adminLevel });
}
