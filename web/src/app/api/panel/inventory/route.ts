import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit } from "@/lib/audit";
import { itemsOf } from "@/lib/inventory";

/** Слепок инвентаря игрока для карточки в панели. */
export async function GET(request: Request) {
  const admin = await requirePanel(3, "users.inventory");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const snapshot = await db.inventorySnapshot.findUnique({ where: { userId } });
  if (!snapshot) return Response.json({ snapshot: null, pending: await pending(userId) });

  return Response.json({
    snapshot: {
      items: itemsOf(snapshot.items),
      world: snapshot.world,
      x: snapshot.x,
      y: snapshot.y,
      z: snapshot.z,
      health: snapshot.health,
      food: snapshot.food,
      xpLevel: snapshot.xpLevel,
      gameMode: snapshot.gameMode,
      takenAt: snapshot.takenAt,
    },
    pending: await pending(userId),
  });
}

/**
 * Запрос свежего слепка: кладём поручение, плагин заберёт его на ближайшем
 * опросе и пришлёт инвентарь. Игрока не в сети это не разбудит, поэтому в
 * панели остаётся последний известный слепок.
 */
export async function POST(request: Request) {
  const admin = await requirePanel(3, "users.inventory");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, login: true } });
  if (!user) return Response.json({ error: "Игрок не найден" }, { status: 404 });

  // Копить поручения незачем: нажатий может быть много, слепок нужен один.
  if (!(await pending(userId))) {
    await db.serverAction.create({
      data: { kind: "SNAPSHOT_INVENTORY", login: user.login, userId: user.id },
    });
  }

  await audit({ actorId: admin.id, action: "admin.inventory.refresh", targetUserId: user.id });
  return Response.json({ ok: true });
}

async function pending(userId: string): Promise<boolean> {
  const waiting = await db.serverAction.findFirst({
    where: { userId, kind: "SNAPSHOT_INVENTORY", deliveredAt: null },
    select: { id: true },
  });
  return waiting !== null;
}
