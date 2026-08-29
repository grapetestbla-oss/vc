import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";
import { listRanks } from "@/lib/ranks";

/** Выдача и снятие админок. Только chief administrator. */
export async function POST(request: Request) {
  const admin = await requirePanel(5, "users.staff");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { userId, level } = (await request.json()) as { userId?: string; level?: number };
  if (!userId || level === undefined || level < 0) {
    return Response.json({ error: "Некорректный уровень" }, { status: 400 });
  }
  // Уровни больше не зашиты числом 5: их список задаётся рангами в панели.
  if (level > 0) {
    const ranks = await listRanks();
    if (!ranks.some((rank) => rank.level === level)) {
      return Response.json({ error: "Такого ранга нет" }, { status: 400 });
    }
  }
  if (userId === admin.id) {
    return Response.json({ error: "Свой уровень менять нельзя" }, { status: 400 });
  }

  const before = await db.user.findUnique({ where: { id: userId }, select: { adminLevel: true } });
  await db.user.update({ where: { id: userId }, data: { adminLevel: level } });
  await audit({
    actorId: admin.id,
    action: "admin.staff.set",
    targetUserId: userId,
    ip: clientIp(request),
    meta: { from: before?.adminLevel ?? 0, to: level },
  });

  return Response.json({ ok: true });
}
