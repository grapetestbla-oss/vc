import { createHmac, randomBytes } from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";

export class GiveawayError extends Error {}

export const GIVEAWAY_STATUS_LABEL: Record<string, string> = {
  active: "Идёт",
  finished: "Завершён",
  cancelled: "Отменён",
};

export function hoursOf(playtimeSec: number): number {
  return Math.floor((playtimeSec / 3600) * 10) / 10;
}

/** Активные розыгрыши: те, что не завершены и не просрочены. */
export function activeGiveaways() {
  return db.giveaway.findMany({
    where: {
      status: "active",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { entries: true } } },
  });
}

export async function createGiveaway(params: {
  adminId: string;
  title: string;
  prize: string;
  description: string;
  requiredHours: number;
  endsAt: Date | null;
}) {
  const title = params.title.trim().slice(0, 120);
  const prize = params.prize.trim().slice(0, 200);
  if (title.length < 3) throw new GiveawayError("Слишком короткое название");
  if (prize.length < 2) throw new GiveawayError("Укажите приз");

  const hours = Math.floor(params.requiredHours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 1000) {
    throw new GiveawayError("Часы от 0 до 1000");
  }
  if (params.endsAt && params.endsAt.getTime() < Date.now()) {
    throw new GiveawayError("Дата окончания уже прошла");
  }

  const giveaway = await db.giveaway.create({
    data: {
      title,
      prize,
      description: params.description.trim().slice(0, 1000) || null,
      requiredHours: hours,
      endsAt: params.endsAt,
      createdById: params.adminId,
    },
  });
  await audit({
    actorId: params.adminId,
    action: "admin.giveaway.create",
    meta: { giveawayId: giveaway.id, title, requiredHours: hours },
  });
  return giveaway;
}

/** Участие. Часы проверяются на сервере: кнопка на сайте — только подсказка. */
export async function joinGiveaway(params: { giveawayId: string; userId: string }) {
  const [giveaway, user] = await Promise.all([
    db.giveaway.findUnique({ where: { id: params.giveawayId } }),
    db.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { playtimeSec: true },
    }),
  ]);

  if (!giveaway) throw new GiveawayError("Розыгрыш не найден");
  if (giveaway.status !== "active") throw new GiveawayError("Розыгрыш уже завершён");
  if (giveaway.endsAt && giveaway.endsAt < new Date()) {
    throw new GiveawayError("Приём заявок закончился");
  }

  const hours = hoursOf(user.playtimeSec);
  if (hours < giveaway.requiredHours) {
    throw new GiveawayError(
      `Нужно ${giveaway.requiredHours} ч на сервере, у вас ${hours} ч`,
    );
  }

  const existing = await db.giveawayEntry.findUnique({
    where: { giveawayId_userId: { giveawayId: giveaway.id, userId: params.userId } },
  });
  if (existing) throw new GiveawayError("Вы уже участвуете");

  await db.giveawayEntry.create({
    data: {
      giveawayId: giveaway.id,
      userId: params.userId,
      hoursAtEntry: Math.floor(hours),
    },
  });

  return giveaway;
}

/**
 * Розыгрыш победителя. Сид генерируется здесь и сохраняется: по нему любой
 * может пересчитать выбор — «рукой» победителя не назначить.
 */
export async function drawGiveaway(params: { giveawayId: string; adminId: string }) {
  const giveaway = await db.giveaway.findUnique({
    where: { id: params.giveawayId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, login: true, playtimeSec: true } } },
      },
    },
  });
  if (!giveaway) throw new GiveawayError("Розыгрыш не найден");
  if (giveaway.status !== "active") throw new GiveawayError("Розыгрыш уже завершён");

  // К моменту розыгрыша условие должно выполняться — иначе приз уйдёт тому,
  // кто набрал часы, а потом их «потерял» после обнуления аккаунта.
  const eligible = giveaway.entries.filter(
    (entry) => hoursOf(entry.user.playtimeSec) >= giveaway.requiredHours,
  );
  if (eligible.length === 0) throw new GiveawayError("Нет участников, подходящих по условию");

  const seed = randomBytes(16).toString("hex");
  const digest = createHmac("sha256", seed).update(giveaway.id).digest("hex");
  const index = parseInt(digest.slice(0, 12), 16) % eligible.length;
  const winner = eligible[index];

  const finished = await db.giveaway.update({
    where: { id: giveaway.id },
    data: {
      status: "finished",
      winnerId: winner.userId,
      drawnAt: new Date(),
      drawSeed: seed,
      drawnFrom: eligible.length,
    },
    include: { winner: { select: { login: true } } },
  });
  await audit({
    actorId: params.adminId,
    action: "admin.giveaway.draw",
    targetUserId: winner.userId,
    meta: { giveawayId: giveaway.id, seed, participants: eligible.length },
  });

  return finished;
}

export async function cancelGiveaway(params: { giveawayId: string; adminId: string }) {
  const giveaway = await db.giveaway.findUnique({ where: { id: params.giveawayId } });
  if (!giveaway) throw new GiveawayError("Розыгрыш не найден");
  if (giveaway.status === "finished") throw new GiveawayError("Розыгрыш уже завершён");

  const cancelled = await db.giveaway.update({
    where: { id: giveaway.id },
    data: { status: "cancelled" },
  });
  await audit({
    actorId: params.adminId,
    action: "admin.giveaway.cancel",
    meta: { giveawayId: giveaway.id },
  });
  return cancelled;
}
