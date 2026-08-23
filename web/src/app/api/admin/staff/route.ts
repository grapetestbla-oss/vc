import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";

/** Выдача и снятие админок. Только chief administrator. */
export async function POST(request: Request) {
  const admin = await requireAdmin(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { userId, level } = (await request.json()) as { userId?: string; level?: number };
  if (!userId || level === undefined || level < 0 || level > 5) {
    return Response.json({ error: "Некорректный уровень" }, { status: 400 });
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
