import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { levelFromPlaytime } from "@/lib/levels";

/** Профиль игрока для плагина: баланс, уровень, админка, активные наказания. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const login = new URL(request.url).searchParams.get("login");
  if (!login) return Response.json({ error: "login required" }, { status: 400 });

  const user = await db.user.findUnique({
    where: { login },
    include: {
      punishments: { where: { active: true }, orderBy: { issuedAt: "desc" } },
      cosmetics: { where: { equipped: true } },
    },
  });
  if (!user) return Response.json({ error: "not found" }, { status: 404 });

  const jail = user.punishments.find((p) => p.type === "JAIL");

  return Response.json({
    login: user.login,
    balanceVc: user.balanceVc,
    level: levelFromPlaytime(user.playtimeSec),
    playtimeSec: user.playtimeSec,
    adminLevel: user.adminLevel,
    cosmetics: user.cosmetics.map((c) => c.key),
    warns: user.punishments.filter((p) => p.type === "WARN").length,
    jail: jail
      ? {
          id: jail.id,
          reason: jail.reason,
          totalSeconds: jail.totalSeconds,
          remainingSeconds: jail.remainingSeconds,
          blocksMined: jail.blocksMined,
          inventoryData: jail.inventoryData,
          returnLocation: jail.returnLocation,
        }
      : null,
  });
}
