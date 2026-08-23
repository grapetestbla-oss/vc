import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { applyTransaction, InsufficientFunds } from "@/lib/economy";
import { checkLimits, nextRoll } from "@/lib/games";
import { crashPoint } from "@/lib/fairness";
import { CONFIG } from "@/lib/config";
import { checkGameAnomaly } from "@/lib/antifraud";

/**
 * Краш с автовыводом: игрок заранее называет множитель, на котором забирает.
 * Раунд считается на сервере целиком — так у клиента нет способа «дожать»
 * результат, подкрутив время нажатия.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { bet, cashOutAt } = (await request.json()) as { bet?: number; cashOutAt?: number };
  const stake = Math.floor(bet ?? 0);
  const target = Number(cashOutAt);
  if (!Number.isFinite(target) || target < 1.01 || target > 100) {
    return Response.json({ error: "Точка вывода от 1.01 до 100" }, { status: 400 });
  }
  const limit = await checkLimits(user.id, stake);
  if (limit) return Response.json({ error: limit }, { status: 400 });

  try {
    await applyTransaction({
      userId: user.id,
      type: "GAME_BET",
      amount: -stake,
      meta: { game: "crash", cashOutAt: target },
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      return Response.json({ error: "Недостаточно VC" }, { status: 400 });
    }
    throw error;
  }

  const { value, serverSeedHash, clientSeed, nonce } = await nextRoll(user.id);
  const point = crashPoint(value, CONFIG.rtp);
  const won = point >= target;
  const payout = won ? Math.floor(stake * target) : 0;

  if (payout > 0) {
    await applyTransaction({
      userId: user.id,
      type: "GAME_WIN",
      amount: payout,
      meta: { game: "crash", point, nonce },
    });
  }

  await db.gameRound.create({
    data: {
      userId: user.id,
      game: "CRASH",
      betVc: stake,
      target,
      result: point,
      payoutVc: payout,
      won,
      serverSeedHash,
      clientSeed,
      nonce,
    },
  });
  await checkGameAnomaly(user.id);

  const fresh = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { balanceVc: true },
  });

  return Response.json({
    crashPoint: point,
    won,
    payout,
    balance: fresh.balanceVc,
    fairness: { serverSeedHash, clientSeed, nonce },
  });
}
