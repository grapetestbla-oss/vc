import { db } from "./db";
import { applyTransaction } from "./economy";
import { levelFromPlaytime } from "./levels";

export class PromoError extends Error {}

/**
 * Привязка промокода к аккаунту. Один раз и навсегда: сменить партнёра позже
 * нельзя, иначе атрибуция теряет смысл и её начинают перепродавать.
 */
export async function attachPromo(userId: string, rawCode: string, source: "web" | "game") {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new PromoError("Введите код");

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.referredByPromoId) throw new PromoError("Промокод уже привязан к аккаунту");

  const promo = await db.promo.findUnique({ where: { code } });
  if (!promo || !promo.active) throw new PromoError("Такого промокода нет");
  if (promo.partnerId === userId) throw new PromoError("Свой промокод активировать нельзя");

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { referredByPromoId: promo.id } }),
    db.promoActivation.create({ data: { promoId: promo.id, userId, source } }),
  ]);

  return promo;
}

/**
 * Выдаёт награду, если аккаунт дорос до нужного уровня. Вызывается после
 * привязки и при каждом обновлении наигранного времени.
 */
export async function rewardPendingPromo(userId: string): Promise<number | null> {
  const activation = await db.promoActivation.findFirst({
    where: { userId, rewardedAt: null },
    include: { promo: true },
  });
  if (!activation || !activation.promo.active) return null;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (levelFromPlaytime(user.playtimeSec) < activation.promo.requiredLevel) return null;

  // Отмечаем условием: две параллельные проверки не начислят награду дважды.
  const marked = await db.promoActivation.updateMany({
    where: { id: activation.id, rewardedAt: null },
    data: { rewardedAt: new Date() },
  });
  if (marked.count === 0) return null;

  await applyTransaction({
    userId,
    type: "PROMO",
    amount: activation.promo.rewardVc,
    meta: { code: activation.promo.code },
  });
  return activation.promo.rewardVc;
}

/** Статус промокода для кабинета: привязан, награда получена или ещё нет. */
export async function promoStatus(userId: string) {
  const activation = await db.promoActivation.findFirst({
    where: { userId },
    include: { promo: { include: { partner: { select: { login: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (!activation) return null;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    code: activation.promo.code,
    partner: activation.promo.partner?.login ?? null,
    rewardVc: activation.promo.rewardVc,
    requiredLevel: activation.promo.requiredLevel,
    level: levelFromPlaytime(user.playtimeSec),
    rewarded: Boolean(activation.rewardedAt),
  };
}
