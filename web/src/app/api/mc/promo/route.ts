import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { levelFromPlaytime } from "@/lib/levels";
import { applyTransaction } from "@/lib/economy";
import { rateLimit } from "@/lib/ratelimit";

/** /promo <код> — промокод медиапартнёра. Один на аккаунт, с 3 уровня. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, code } = (await request.json()) as { login?: string; code?: string };
  if (!login || !code) return Response.json({ error: "bad request" }, { status: 400 });
  if (!rateLimit(`promo:${login}`, 5, 600)) {
    return Response.json({ status: "rate_limited" });
  }

  const user = await db.user.findUnique({ where: { login } });
  if (!user) return Response.json({ status: "no_account" });

  const promo = await db.promo.findUnique({
    where: { code: code.toUpperCase() },
    include: { partner: { select: { login: true } } },
  });
  if (!promo || !promo.active) return Response.json({ status: "not_found" });

  const level = levelFromPlaytime(user.playtimeSec);
  if (level < promo.requiredLevel) {
    return Response.json({ status: "level_too_low", required: promo.requiredLevel, level });
  }

  // Один промокод на аккаунт — и конкретный, и любой другой.
  const alreadyUsedAny = await db.promoActivation.findFirst({ where: { userId: user.id } });
  if (alreadyUsedAny) return Response.json({ status: "already_used" });

  try {
    await db.promoActivation.create({ data: { promoId: promo.id, userId: user.id } });
  } catch {
    return Response.json({ status: "already_used" });
  }

  const balance = await applyTransaction({
    userId: user.id,
    type: "PROMO",
    amount: promo.rewardVc,
    meta: { code: promo.code, partner: promo.partner?.login ?? null },
  });

  return Response.json({ status: "ok", reward: promo.rewardVc, balance });
}
