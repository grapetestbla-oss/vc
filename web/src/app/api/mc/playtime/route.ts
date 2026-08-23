import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { rewardPendingPromo } from "@/lib/promo";

/** Плагин раз в минуту присылает наигранные секунды по онлайн-игрокам. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { entries } = (await request.json()) as {
    entries?: { login: string; seconds: number }[];
  };
  if (!entries?.length) return Response.json({ updated: 0 });

  let updated = 0;
  for (const entry of entries) {
    if (!entry.login || !Number.isFinite(entry.seconds) || entry.seconds <= 0) continue;
    // Больше 120 секунд за минутный тик быть не может — защита от накрутки.
    const seconds = Math.min(120, Math.floor(entry.seconds));
    const result = await db.user.updateMany({
      where: { login: entry.login },
      data: { playtimeSec: { increment: seconds }, lastSeenAt: new Date() },
    });
    updated += result.count;

    // Уровень мог только что дорасти до порога промокода — проверяем.
    const player = await db.user.findUnique({
      where: { login: entry.login },
      select: { id: true },
    });
    if (player) await rewardPendingPromo(player.id);
  }
  return Response.json({ updated });
}
