import { db } from "./db";
import { audit } from "./audit";
import { liftPunishment } from "./punishments";

export class AppealError extends Error {}

export const APPEAL_STATUS_LABEL: Record<string, string> = {
  pending: "На рассмотрении",
  approved: "Разбанен",
  rejected: "Отказано",
};

/**
 * Подача заявления. Логин может не существовать — принимаем всё равно:
 * человек мог ошибиться в регистре, пусть администрация разберётся сама.
 */
export async function createAppeal(params: {
  login: string;
  contact: string;
  text: string;
  ip: string | null;
}) {
  const login = params.login.trim();
  const contact = params.contact.trim();
  const text = params.text.trim();

  if (login.length < 3 || login.length > 32) throw new AppealError("Укажите ник");
  if (contact.length < 3) throw new AppealError("Оставьте контакт для ответа");
  if (text.length < 20) throw new AppealError("Опишите ситуацию подробнее — минимум 20 символов");
  if (text.length > 2000) throw new AppealError("Слишком длинно, уложитесь в 2000 символов");

  const user = await db.user.findUnique({
    where: { login },
    include: { punishments: { where: { type: "BAN", active: true }, orderBy: { issuedAt: "desc" } } },
  });

  // Одно открытое заявление на ник: иначе одна и та же история приходит пачкой.
  const pending = await db.appeal.findFirst({ where: { login, status: "pending" } });
  if (pending) throw new AppealError("По этому нику уже есть заявление на рассмотрении");

  return db.appeal.create({
    data: {
      login,
      userId: user?.id ?? null,
      contact,
      text,
      ip: params.ip,
      punishmentId: user?.punishments[0]?.id ?? null,
    },
  });
}

/** Решение по заявлению. Одобрение снимает активный бан с аккаунта. */
export async function reviewAppeal(params: {
  appealId: string;
  adminId: string;
  approve: boolean;
  note: string | null;
}) {
  const appeal = await db.appeal.findUnique({ where: { id: params.appealId } });
  if (!appeal) throw new AppealError("Заявление не найдено");
  if (appeal.status !== "pending") throw new AppealError("Заявление уже разобрано");

  const claimed = await db.appeal.updateMany({
    where: { id: params.appealId, status: "pending" },
    data: {
      status: params.approve ? "approved" : "rejected",
      reviewedById: params.adminId,
      reviewedAt: new Date(),
      reviewNote: params.note,
    },
  });
  if (claimed.count === 0) throw new AppealError("Заявление уже разобрали");

  let liftedBans = 0;
  if (params.approve && appeal.userId) {
    const bans = await db.punishment.findMany({
      where: { userId: appeal.userId, type: "BAN", active: true },
    });
    for (const ban of bans) {
      await liftPunishment(ban.id, params.adminId);
      liftedBans++;
    }
  }

  await audit({
    actorId: params.adminId,
    action: params.approve ? "admin.appeal.approve" : "admin.appeal.reject",
    targetUserId: appeal.userId,
    meta: { appealId: appeal.id, login: appeal.login, liftedBans },
  });

  return { liftedBans };
}
