import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { sendMessage } from "@/lib/telegram";

/**
 * Выдача нового пароля игроку.
 *
 * Посмотреть действующий пароль нельзя ни с какими правами: в базе лежит
 * argon2-хеш, исходного пароля там нет. Поэтому единственный способ вернуть
 * человеку доступ — выдать новый и показать его один раз тому, кто выдал.
 */

/** Без похожих символов: пароль диктуют голосом и переписывают руками. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newPassword(): string {
  // Длина 14 — с запасом против перебора, но ещё выговариваемо.
  let value = "";
  for (let i = 0; i < 14; i++) value += ALPHABET[randomInt(0, ALPHABET.length)];
  // Требование сайта: буквы и цифры обязательно — гарантируем, а не надеемся.
  return `${value}7a`;
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "users.password");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { userId, confirm } = (await request.json().catch(() => ({}))) as {
    userId?: string;
    confirm?: string;
  };
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      login: true,
      adminLevel: true,
      telegram: { select: { telegramId: true } },
    },
  });
  if (!target) return Response.json({ error: "Игрок не найден" }, { status: 404 });

  // Тот же порядок, что и при обнулении: своего уровня и выше не трогаем.
  if (target.adminLevel >= admin.adminLevel && target.id !== admin.id) {
    return Response.json({ error: "Цель того же уровня или выше" }, { status: 403 });
  }
  // Ник вписывается руками: смена пароля выкидывает человека из аккаунта.
  if ((confirm ?? "").trim() !== target.login) {
    return Response.json({ error: `Впишите ник ${target.login} для подтверждения` }, { status: 400 });
  }

  const password = newPassword();
  await db.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password) },
  });
  // Старые сессии больше не действуют — иначе смена пароля ничего не закрывает.
  await db.session.deleteMany({ where: { userId: target.id } });

  await audit({
    actorId: admin.id,
    action: "admin.password.reset",
    targetUserId: target.id,
    ip: clientIp(request),
  });

  // Игрок должен узнать о смене, даже если её сделали без его просьбы.
  if (target.telegram) {
    await sendMessage(
      target.telegram.telegramId,
      [
        "Администрация сменила пароль вашего аккаунта.",
        "Новый пароль вам передадут в поддержке.",
        "Если вы этого не просили — напишите администрации.",
      ].join("\n"),
    );
  }

  return Response.json({ ok: true, login: target.login, password });
}
