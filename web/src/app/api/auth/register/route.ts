import { db } from "@/lib/db";
import { hashPassword, LOGIN_RE, passwordProblem } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`register:${ip}`, 5, 3600)) {
    return Response.json({ error: "Слишком много регистраций с этого адреса" }, { status: 429 });
  }

  const { login, email, password } = (await request.json()) as {
    login?: string;
    email?: string;
    password?: string;
  };

  if (!login || !LOGIN_RE.test(login)) {
    return Response.json({ error: "Логин: 3-16 символов, латиница, цифры и _" }, { status: 400 });
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Некорректная почта" }, { status: 400 });
  }
  const problem = password ? passwordProblem(password) : "Пароль обязателен";
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const existing = await db.user.findFirst({
    where: { OR: [{ login }, { email: email.toLowerCase() }] },
  });
  if (existing) {
    return Response.json({ error: "Логин или почта уже заняты" }, { status: 409 });
  }

  // Первый администратор: логин из BOOTSTRAP_ADMIN_LOGIN получает 5 уровень
  // при регистрации. Иначе панель некому открыть — и пришлось бы лезть в базу.
  const bootstrap = process.env.BOOTSTRAP_ADMIN_LOGIN;
  const isBootstrapAdmin = Boolean(bootstrap) && bootstrap === login;

  const user = await db.user.create({
    data: {
      login,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password!),
      lastIp: ip,
      adminLevel: isBootstrapAdmin ? 5 : 0,
    },
  });
  await db.knownIp.create({ data: { userId: user.id, ip } });
  await createSession(user.id, ip, request.headers.get("user-agent") ?? undefined);
  await audit({
    actorId: user.id,
    action: isBootstrapAdmin ? "account.register.bootstrap-admin" : "account.register",
    ip,
  });

  return Response.json({ ok: true, login: user.login, adminLevel: user.adminLevel });
}
