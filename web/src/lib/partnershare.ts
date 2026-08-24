import { db } from "./db";
import { applyTransaction } from "./economy";
import { CONFIG } from "./config";
import { audit } from "./audit";

/**
 * Отчисление медиапартнёру: процент от VC, начисленных игроку, который
 * привязал его промокод. Считаем только от пополнений за деньги — если
 * начислять и с бонусов, партнёр сможет накручивать себе баланс через
 * собственные же коды.
 */
export async function payPartnerShare(params: {
  userId: string;
  creditedVc: number;
  paymentId: string;
}): Promise<{ partnerLogin: string; amount: number } | null> {
  if (params.creditedVc <= 0 || CONFIG.partnerSharePercent <= 0) return null;

  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { referredByPromo: { select: { id: true, code: true, active: true, partnerId: true } } },
  });
  const promo = user?.referredByPromo;
  if (!promo?.active || !promo.partnerId) return null;
  // Собственное пополнение партнёра долю не приносит.
  if (promo.partnerId === params.userId) return null;

  const amount = Math.floor((params.creditedVc * CONFIG.partnerSharePercent) / 100);
  if (amount <= 0) return null;

  const partner = await db.user.findUnique({
    where: { id: promo.partnerId },
    select: { id: true, login: true },
  });
  if (!partner) return null;

  await applyTransaction({
    userId: partner.id,
    type: "PARTNER_SHARE",
    amount,
    meta: {
      promoCode: promo.code,
      fromUserId: params.userId,
      paymentId: params.paymentId,
      percent: CONFIG.partnerSharePercent,
      creditedVc: params.creditedVc,
    },
  });
  await audit({
    actorId: null,
    action: "partner.share",
    targetUserId: partner.id,
    meta: { amount, promoCode: promo.code, paymentId: params.paymentId },
  });

  return { partnerLogin: partner.login, amount };
}

/** Сколько партнёр заработал на своём промокоде — для кабинета и панели. */
export async function partnerEarnings(partnerId: string): Promise<number> {
  const total = await db.transaction.aggregate({
    where: { userId: partnerId, type: "PARTNER_SHARE" },
    _sum: { amount: true },
  });
  return total._sum.amount ?? 0;
}
