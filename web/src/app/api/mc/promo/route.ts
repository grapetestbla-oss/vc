import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { attachPromo, PromoError, rewardPendingPromo } from "@/lib/promo";
import { levelFromPlaytime } from "@/lib/levels";
import { rateLimit } from "@/lib/ratelimit";

/**
 * /promo <код> в игре. Привязывает код к аккаунту, если он ещё не привязан,
 * и сразу выдаёт награду, когда уровень уже достаточный.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, code } = (await request.json()) as { login?: string; code?: string };
  if (!login || !code) return Response.json({ error: "bad request" }, { status: 400 });
  if (!rateLimit(`promo:${login}`, 5, 600)) return Response.json({ status: "rate_limited" });

  const user = await db.user.findUnique({ where: { login } });
  if (!user) return Response.json({ status: "no_account" });

  try {
    const promo = await attachPromo(user.id, code, "game");
    const reward = await rewardPendingPromo(user.id);
    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    return Response.json({
      status: "ok",
      reward: reward ?? 0,
      pending: reward === null,
      required: promo.requiredLevel,
      level: levelFromPlaytime(fresh.playtimeSec),
      balance: fresh.balanceVc,
    });
  } catch (error) {
    if (error instanceof PromoError) {
      return Response.json({ status: "error", message: error.message });
    }
    throw error;
  }
}
