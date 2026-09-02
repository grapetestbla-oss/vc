import { db } from "./db";
import { applyTransaction } from "./economy";

/**
 * Дневная норма игры.
 *
 * За пять часов активной игры в сутки — награда. Считаем только активные
 * секунды: плагин присылает признак, отдыхал игрок или стоял в афк, иначе
 * норму закрывал бы любой, кто оставил клиент на ночь.
 */

export function goalSeconds(): number {
  const hours = Number.parseFloat(process.env.DAILY_ACTIVE_HOURS ?? "");
  return Math.round((Number.isFinite(hours) && hours > 0 ? hours : 5) * 3600);
}

export function rewardVc(): number {
  const value = Number.parseInt(process.env.DAILY_REWARD_VC ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 200;
}

/** Сутки считаем по времени сервера: игроки и администрация живут в одном. */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type DailyProgress = {
  activeSec: number;
  goalSec: number;
  rewarded: boolean;
  justRewarded: boolean;
  rewardVc: number;
};

/**
 * Засчитывает активные секунды и, если норма закрыта впервые за сутки, выдаёт
 * награду. Возвращает прогресс — плагин рисует его на боковой панели.
 */
export async function addActiveTime(
  userId: string,
  seconds: number,
): Promise<DailyProgress> {
  const goalSec = goalSeconds();
  const amount = rewardVc();
  const day = today();

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { activeSecToday: true, activeDay: true, dailyRewardAt: true },
  });
  if (!user) return { activeSec: 0, goalSec, rewarded: false, justRewarded: false, rewardVc: amount };

  // Новый день — счётчик и награда начинаются заново.
  const fresh = user.activeDay !== day;
  const before = fresh ? 0 : user.activeSecToday;
  const activeSec = before + Math.max(0, seconds);
  const rewardedBefore = !fresh && user.dailyRewardAt !== null;

  const crossed = !rewardedBefore && before < goalSec && activeSec >= goalSec;

  await db.user.update({
    where: { id: userId },
    data: {
      activeSecToday: activeSec,
      activeDay: day,
      ...(fresh ? { dailyRewardAt: null } : {}),
      ...(crossed ? { dailyRewardAt: new Date() } : {}),
    },
  });

  if (crossed) {
    await applyTransaction({
      userId,
      type: "BONUS",
      amount,
      meta: { reason: "daily", goalSec },
    });
  }

  return {
    activeSec,
    goalSec,
    rewarded: rewardedBefore || crossed,
    justRewarded: crossed,
    rewardVc: amount,
  };
}
