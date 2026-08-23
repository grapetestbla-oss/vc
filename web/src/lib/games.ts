import { db } from "./db";
import { newServerSeed, roll } from "./fairness";
import { CONFIG } from "./config";
import { randomToken } from "./auth";

/** Активная пара сидов игрока; создаётся при первой игре. */
export async function activeSeed(userId: string) {
  const existing = await db.seed.findFirst({ where: { userId, active: true } });
  if (existing) return existing;
  const { serverSeed, serverSeedHash } = newServerSeed();
  return db.seed.create({
    data: { userId, serverSeed, serverSeedHash, clientSeed: randomToken(8) },
  });
}

/** Берёт следующий бросок и двигает nonce. */
export async function nextRoll(userId: string) {
  const seed = await activeSeed(userId);
  const updated = await db.seed.update({
    where: { id: seed.id },
    data: { nonce: { increment: 1 } },
  });
  return {
    value: roll(seed.serverSeed, seed.clientSeed, updated.nonce),
    serverSeedHash: seed.serverSeedHash,
    clientSeed: seed.clientSeed,
    nonce: updated.nonce,
  };
}

/**
 * Игровые лимиты. Возвращает текст ошибки или null.
 * Дневной лимит проигрыша и пауза после серии — не украшение: без них
 * мини-игры превращаются в способ за вечер потерять всё и уйти с сервера.
 */
export async function checkLimits(userId: string, bet: number): Promise<string | null> {
  if (!Number.isFinite(bet) || bet < CONFIG.minBet) return `Минимальная ставка ${CONFIG.minBet} VC`;
  if (bet > CONFIG.maxBet) return `Максимальная ставка ${CONFIG.maxBet} VC`;

  const since = new Date(Date.now() - 86_400_000);
  const rounds = await db.gameRound.findMany({
    where: { userId, createdAt: { gt: since } },
    select: { betVc: true, payoutVc: true },
  });
  const net = rounds.reduce((sum, r) => sum + r.payoutVc - r.betVc, 0);
  if (-net >= CONFIG.dailyLossLimit) {
    return "Дневной лимит проигрыша исчерпан. Возвращайтесь завтра.";
  }

  const recent = await db.gameRound.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: CONFIG.coolDownAfterLosses,
    select: { won: true, createdAt: true },
  });
  if (
    recent.length === CONFIG.coolDownAfterLosses &&
    recent.every((r) => !r.won) &&
    Date.now() - recent[0].createdAt.getTime() < CONFIG.coolDownSeconds * 1000
  ) {
    const waitSec = Math.ceil(
      (CONFIG.coolDownSeconds * 1000 - (Date.now() - recent[0].createdAt.getTime())) / 1000,
    );
    return `Перерыв после серии проигрышей: ещё ${waitSec} секунд`;
  }

  return null;
}
