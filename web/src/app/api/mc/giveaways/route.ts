import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { activeGiveaways, hoursOf } from "@/lib/giveaways";

/**
 * Активные розыгрыши для плагина. Если передан ник — добавляем персональные
 * данные: сколько часов у игрока и участвует ли он уже.
 */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const login = new URL(request.url).searchParams.get("login");
  const giveaways = await activeGiveaways();

  const user = login
    ? await db.user.findUnique({
        where: { login },
        select: { id: true, playtimeSec: true },
      })
    : null;

  const entries = user
    ? await db.giveawayEntry.findMany({
        where: { userId: user.id, giveawayId: { in: giveaways.map((item) => item.id) } },
        select: { giveawayId: true },
      })
    : [];
  const joined = new Set(entries.map((entry) => entry.giveawayId));

  return Response.json({
    hours: user ? hoursOf(user.playtimeSec) : null,
    giveaways: giveaways.map((giveaway) => ({
      id: giveaway.id,
      title: giveaway.title,
      prize: giveaway.prize,
      requiredHours: giveaway.requiredHours,
      participants: giveaway._count.entries,
      endsAt: giveaway.endsAt?.getTime() ?? null,
      joined: joined.has(giveaway.id),
    })),
  });
}
