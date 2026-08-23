/**
 * Создание или обновление администратора.
 *
 *   ADMIN_LOGIN=nick ADMIN_EMAIL=mail@example.com ADMIN_PASSWORD=secret \
 *     node prisma/create-admin.mjs
 *
 * Если аккаунт с таким логином уже есть — обновляются пароль, почта и уровень.
 * Обычный JS без сборки: скрипт должен запускаться прямо в рабочем контейнере,
 * где нет ни tsx, ни исходников на TypeScript.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const LOGIN_RE = /^[A-Za-z0-9_]{3,16}$/;

const db = new PrismaClient();

async function main() {
  const login = process.env.ADMIN_LOGIN?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const level = Number(process.env.ADMIN_LEVEL ?? 5);

  if (!login || !LOGIN_RE.test(login)) {
    throw new Error("ADMIN_LOGIN: 3-16 символов, латиница, цифры и _");
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL: некорректная почта");
  }
  if (!password || password.length < 8) {
    throw new Error("ADMIN_PASSWORD: минимум 8 символов");
  }
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new Error("ADMIN_LEVEL: от 1 до 5");
  }

  // Почта могла остаться за другим аккаунтом — иначе upsert упадёт по уникальности.
  const emailOwner = await db.user.findUnique({ where: { email } });
  if (emailOwner && emailOwner.login !== login) {
    throw new Error(`Почта уже занята аккаунтом ${emailOwner.login}`);
  }

  const passwordHash = await hash(password, ARGON);
  const user = await db.user.upsert({
    where: { login },
    create: { login, email, passwordHash, adminLevel: level },
    update: { email, passwordHash, adminLevel: level },
  });

  await db.auditLog.create({
    data: { action: "admin.create.cli", targetUserId: user.id, meta: { login, level } },
  });

  console.log(`Готово: ${user.login} (${user.email}), уровень ${user.adminLevel}.`);
  console.log("Вход: сначала /login на сайте, затем /panel — пароль спросят ещё раз.");
}

main()
  .catch((error) => {
    console.error("Ошибка:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
