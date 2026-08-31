import { createHash, randomInt } from "node:crypto";
import { db } from "./db";
import { hashPassword, passwordProblem, safeEqual } from "./auth";
import { sendMessage } from "./telegram";

/**
 * Восстановление пароля.
 *
 * Почту сайт не отправляет — транспорта нет, и «мы выслали письмо» было бы
 * обманом. Единственный работающий канал — Telegram-бот: код уходит туда, где
 * человек уже подтвердил, что владеет аккаунтом. Без привязки восстановить
 * пароль нельзя, и это честно написано на странице.
 */

export const CODE_MINUTES = 15;
/** Сколько раз можно ошибиться, прежде чем код сгорит. */
export const MAX_ATTEMPTS = 5;

function code(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Код короткий, поэтому argon2 тут лишний: хватает хеша и счётчика попыток. */
function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type RequestResult = { sent: boolean };

/**
 * Заявка на восстановление. Наружу всегда один и тот же ответ: по нему нельзя
 * узнать, есть ли такой аккаунт и привязан ли к нему Telegram.
 */
export async function requestReset(login: string): Promise<RequestResult> {
  const user = await db.user.findUnique({
    where: { login },
    select: { id: true, login: true, telegram: { select: { telegramId: true } } },
  });
  if (!user?.telegram) return { sent: false };

  const value = code();
  await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
  await db.passwordReset.create({
    data: {
      userId: user.id,
      codeHash: digest(value),
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    },
  });

  await sendMessage(
    user.telegram.telegramId,
    [
      `Код для смены пароля: <b>${value}</b>`,
      `Действует ${CODE_MINUTES} минут.`,
      "",
      "Если вы этого не запрашивали — просто не вводите код и никому его не пересылайте.",
    ].join("\n"),
  );
  return { sent: true };
}

export type ResetOutcome =
  | { ok: true }
  | { ok: false; error: string };

/** Смена пароля по коду. Все сессии после этого закрываются. */
export async function resetPassword(
  login: string,
  value: string,
  password: string,
): Promise<ResetOutcome> {
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };

  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) return { ok: false, error: "Код не подошёл" };

  const reset = await db.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!reset) return { ok: false, error: "Код не подошёл" };
  if (reset.expiresAt < new Date()) {
    await db.passwordReset.delete({ where: { id: reset.id } });
    return { ok: false, error: "Код просрочен, запросите новый" };
  }

  if (!safeEqual(reset.codeHash, digest(value))) {
    const attempts = reset.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      // Перебор шестизначного кода закрываем сжиганием, а не задержкой.
      await db.passwordReset.delete({ where: { id: reset.id } });
      return { ok: false, error: "Слишком много попыток, запросите новый код" };
    }
    await db.passwordReset.update({ where: { id: reset.id }, data: { attempts } });
    return { ok: false, error: "Код не подошёл" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  await db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
  // Чужие сессии могли остаться у того, кто и увёл пароль: закрываем все.
  await db.session.deleteMany({ where: { userId: user.id } });

  return { ok: true };
}
