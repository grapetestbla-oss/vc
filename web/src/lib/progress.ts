import { db } from "./db";
import { applyTransaction } from "./economy";
import { levelFromPlaytime, levelReward } from "./levels";

/**
 * Награды за прокачку.
 *
 * Уровень не хранится, он считается из наигранного времени, поэтому «поймать
 * момент повышения» негде. Вместо этого держим планку: до какого уровня уже
 * заплачено. Каждый тик сверяем её с текущим уровнем и добираем всё, что между
 * ними — тогда пропуск нескольких уровней за один тик (или за время, пока
 * сайт лежал) ничего не теряет.
 */

export type LevelPayout = { fromLevel: number; toLevel: number; vc: number };

/** Сумма наград за уровни (from, to] — обе границы считаем достигнутыми уровнями. */
export function rewardBetween(fromLevel: number, toLevel: number): number {
  let total = 0;
  for (let level = fromLevel + 1; level <= toLevel; level += 1) total += levelReward(level);
  return total;
}

/**
 * Догоняет невыплаченные награды. Возвращает выплату, если она была, — плагину
 * это нужно, чтобы поздравить игрока в чате.
 */
export async function grantLevelRewards(userId: string): Promise<LevelPayout | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { playtimeSec: true, rewardedLevel: true },
  });
  if (!user) return null;

  const level = levelFromPlaytime(user.playtimeSec);

  // Первая встреча: планку ставим по текущему уровню и ничего не платим.
  // Уровни, набранные до появления системы, наградами задним числом не идут.
  if (user.rewardedLevel === null) {
    await db.user.update({ where: { id: userId }, data: { rewardedLevel: level } });
    return null;
  }

  if (level <= user.rewardedLevel) return null;

  const from = user.rewardedLevel;
  // Планку двигаем отдельным условным обновлением: два одновременных тика по
  // одному игроку иначе заплатили бы дважды за один и тот же уровень.
  const moved = await db.user.updateMany({
    where: { id: userId, rewardedLevel: from },
    data: { rewardedLevel: level },
  });
  if (moved.count === 0) return null;

  const vc = rewardBetween(from, level);
  if (vc <= 0) return null;

  await applyTransaction({
    userId,
    type: "BONUS",
    amount: vc,
    meta: { reason: "level", fromLevel: from, toLevel: level },
  });

  return { fromLevel: from, toLevel: level, vc };
}
