import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { applyTransaction, InsufficientFunds } from "@/lib/economy";
import { checkLimits, nextRoll } from "@/lib/games";
import { rouletteWin } from "@/lib/fairness";
import { CONFIG } from "@/lib/config";
import { checkGameAnomaly } from "@/lib/antifraud";

/** Ставка на множитель 2x / 3x / 5x / 10x. Шанс выигрыша = RTP / множитель. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { bet, multiplier } = (await request.json()) as { bet?: number; multiplier?: number };
  const stake = Math.floor(bet ?? 0);
  if (!multiplier || !CONFIG.rouletteMultipliers.includes(multiplier as 2 | 3 | 5 | 10)) {
    return Response.json({ error: "Недопустимый множитель" }, { status: 400 });
  }
  const limit = await checkLimits(user.id, stake);
  if (limit) return Response.json({ error: limit }, { status: 400 });

  try {
    await applyTransaction({
      userId: user.id,
      type: "GAME_BET",
      amount: -stake,
      meta: { game: "roulette", multiplier },
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      return Response.json({ error: "Недостаточно VC" }, { status: 400 });
    }
    throw error;
  }

  const { value, serverSeedHash, clientSeed, nonce } = await nextRoll(user.id);
  const won = rouletteWin(value, multiplier, CONFIG.rtp);
  const payout = won ? stake * multiplier : 0;

  if (payout > 0) {
    await applyTransaction({
      userId: user.id,
      type: "GAME_WIN",
      amount: payout,
      meta: { game: "roulette", multiplier, nonce },
    });
  }

  await db.gameRound.create({
    data: {
      userId: user.id,
      game: "ROULETTE",
      betVc: stake,
      target: multiplier,
      result: won ? multiplier : 0,
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
    won,
    payout,
    balance: fresh.balanceVc,
    fairness: { serverSeedHash, clientSeed, nonce },
  });
}
