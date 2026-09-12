import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { levelFromPlaytime } from "@/lib/levels";

/** Профиль текущего пользователя — для фронта и для проверок. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const [cosmetics, punishments] = await Promise.all([
    db.userCosmetic.findMany({ where: { userId: user.id }, select: { key: true, equipped: true } }),
    db.punishment.count({ where: { userId: user.id, active: true } }),
  ]);

  return Response.json({
    id: user.id,
    login: user.login,
    balanceVc: user.balanceVc,
    level: levelFromPlaytime(user.playtimeSec),
    playtimeSec: user.playtimeSec,
    adminLevel: user.adminLevel,
    cosmetics,
    activePunishments: punishments,
  });
}
