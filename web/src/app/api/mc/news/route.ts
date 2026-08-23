import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";

/**
 * Новости, которые нужно объявить в игре. Плагин опрашивает эту ручку и
 * подтверждает доставку — так объявление не потеряется при рестарте сервера
 * и не повторится дважды.
 */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const pending = await db.news.findMany({
    where: { published: true, broadcast: true, broadcastedAt: null },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, title: true, summary: true, slug: true },
  });

  return Response.json({ news: pending });
}

export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { ids } = (await request.json()) as { ids?: string[] };
  if (!ids?.length) return Response.json({ ok: true, marked: 0 });

  const result = await db.news.updateMany({
    where: { id: { in: ids }, broadcastedAt: null },
    data: { broadcastedAt: new Date() },
  });

  return Response.json({ ok: true, marked: result.count });
}
