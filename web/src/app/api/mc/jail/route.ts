import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";

/**
 * Синхронизация состояния деморгана. Плагин ведёт таймер у себя (он знает,
 * кто онлайн) и раз в 30 секунд сохраняет остаток сюда, чтобы срок пережил
 * рестарт сервера и был виден в панели.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json()) as {
    id?: string;
    remainingSeconds?: number;
    blocksMined?: number;
    inventoryData?: string | null;
    returnLocation?: string | null;
    released?: boolean;
  };
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  const punishment = await db.punishment.update({
    where: { id: body.id },
    data: {
      remainingSeconds: body.remainingSeconds,
      blocksMined: body.blocksMined,
      ...(body.inventoryData !== undefined ? { inventoryData: body.inventoryData } : {}),
      ...(body.returnLocation !== undefined ? { returnLocation: body.returnLocation } : {}),
      ...(body.released ? { active: false, liftedAt: new Date() } : {}),
    },
  });
  return Response.json({ ok: true, active: punishment.active });
}
