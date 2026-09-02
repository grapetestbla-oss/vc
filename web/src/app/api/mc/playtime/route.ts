import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { rewardPendingPromo } from "@/lib/promo";
import { addActiveTime, goalSeconds, rewardVc } from "@/lib/daily";
import { levelFromPlaytime } from "@/lib/levels";

/**
 * Плагин раз в минуту присылает наигранные секунды по онлайн-игрокам и
 * признак, был ли игрок активен. В ответ отдаём то, что рисуется на боковой
 * панели: уровень, баланс и прогресс дневной нормы — плагину незачем ходить за
 * этим отдельным запросом.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { entries } = (await request.json()) as {
    entries?: { login: string; seconds: number; active?: boolean }[];
  };
  if (!entries?.length) return Response.json({ updated: 0, players: {} });

  let updated = 0;
  const players: Record<string, unknown> = {};

  for (const entry of entries) {
    if (!entry.login || !Number.isFinite(entry.seconds) || entry.seconds <= 0) continue;
    // Больше 120 секунд за минутный тик быть не может — защита от накрутки.
    const seconds = Math.min(120, Math.floor(entry.seconds));
    const result = await db.user.updateMany({
      where: { login: entry.login },
      data: { playtimeSec: { increment: seconds }, lastSeenAt: new Date() },
    });
    updated += result.count;

    const player = await db.user.findUnique({
      where: { login: entry.login },
      select: { id: true, balanceVc: true, playtimeSec: true, activeSecToday: true, activeDay: true },
    });
    if (!player) continue;

    // Уровень мог только что дорасти до порога промокода — проверяем.
    await rewardPendingPromo(player.id);

    // Афк не засчитываем в норму, но время игры считаем как раньше.
    const daily = entry.active
      ? await addActiveTime(player.id, seconds)
      : {
          activeSec: player.activeDay === new Date().toISOString().slice(0, 10) ? player.activeSecToday : 0,
          goalSec: goalSeconds(),
          rewarded: false,
          justRewarded: false,
          rewardVc: rewardVc(),
        };

    const fresh = await db.user.findUnique({
      where: { id: player.id },
      select: { balanceVc: true, playtimeSec: true },
    });

    players[entry.login] = {
      level: levelFromPlaytime(fresh?.playtimeSec ?? player.playtimeSec),
      balanceVc: fresh?.balanceVc ?? player.balanceVc,
      activeSec: daily.activeSec,
      goalSec: daily.goalSec,
      rewarded: daily.rewarded,
      justRewarded: daily.justRewarded,
      rewardVc: daily.rewardVc,
    };
  }

  return Response.json({ updated, players });
}
