import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { parseSnapshot } from "@/lib/inventory";

/** Слепок инвентаря от плагина. Храним только последний — история тут не нужна. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = await request.json().catch(() => null);
  const snapshot = parseSnapshot(body);
  if (!snapshot) return Response.json({ error: "bad request" }, { status: 400 });

  const user = await db.user.findUnique({
    where: { login: snapshot.login },
    select: { id: true },
  });
  if (!user) return Response.json({ error: "not found" }, { status: 404 });

  const data = {
    items: snapshot.items,
    world: snapshot.world,
    x: snapshot.x,
    y: snapshot.y,
    z: snapshot.z,
    health: snapshot.health,
    food: snapshot.food,
    xpLevel: snapshot.xpLevel,
    gameMode: snapshot.gameMode,
    takenAt: new Date(),
  };

  await db.inventorySnapshot.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return Response.json({ ok: true });
}
