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
 * Проверка ставки. Потолка ставки, дневного лимита проигрыша и паузы после
 * серии проигрышей нет — так решил владелец сервера. Осталась только нижняя
 * граница: ставка должна быть целым положительным числом, иначе раунд
 * бессмысленен, а нулевой ставкой можно бесконечно крутить сид.
 */
export async function checkLimits(_userId: string, bet: number): Promise<string | null> {
  if (!Number.isFinite(bet) || bet < CONFIG.minBet) return `Минимальная ставка ${CONFIG.minBet} VC`;
  return null;
}
