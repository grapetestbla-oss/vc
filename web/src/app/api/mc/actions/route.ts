import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";

/**
 * Поручения плагину: очистить инвентарь после обнуления аккаунта, прислать
 * слепок инвентаря для панели, объявить редкую находку.
 * Ждут в очереди, пока игрок не окажется в сети, и подтверждаются отдельно,
 * чтобы рестарт сервера не потерял поручение и не выполнил его дважды.
 */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const pending = await db.serverAction.findMany({
    where: { deliveredAt: null },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, kind: true, login: true, payload: true },
  });

  return Response.json({ actions: pending });
}

export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { ids } = (await request.json()) as { ids?: string[] };
  if (!ids?.length) return Response.json({ ok: true, marked: 0 });

  const result = await db.serverAction.updateMany({
    where: { id: { in: ids }, deliveredAt: null },
    data: { deliveredAt: new Date() },
  });

  return Response.json({ ok: true, marked: result.count });
}
