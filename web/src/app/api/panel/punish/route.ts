import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { canPunish, issueBan, issueJail, issueWarn } from "@/lib/punishments";
import { clientIp } from "@/lib/audit";

export async function POST(request: Request) {
  const admin = await requirePanel(3);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { userId, type, reason, minutes, days } = (await request.json()) as {
    userId?: string;
    type?: "JAIL" | "WARN" | "BAN";
    reason?: string;
    minutes?: number;
    days?: number;
  };
  if (!userId || !type || !reason) {
    return Response.json({ error: "Заполните тип и причину" }, { status: 400 });
  }

  const denied = canPunish(admin.adminLevel, type, minutes);
  if (denied) return Response.json({ error: denied }, { status: 403 });

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return Response.json({ error: "Игрок не найден" }, { status: 404 });
  if (target.adminLevel >= admin.adminLevel) {
    return Response.json({ error: "Цель того же уровня или выше" }, { status: 403 });
  }

  const ip = clientIp(request);
  if (type === "JAIL") {
    if (!minutes || minutes < 1) return Response.json({ error: "Укажите минуты" }, { status: 400 });
    await issueJail({ userId, byUserId: admin.id, reason, minutes });
  } else if (type === "WARN") {
    await issueWarn({ userId, byUserId: admin.id, reason });
  } else {
    if (!days || days < 1) return Response.json({ error: "Укажите дни" }, { status: 400 });
    await issueBan({ userId, byUserId: admin.id, reason, days });
  }
  await db.auditLog.create({
    data: { actorId: admin.id, action: "admin.punish.web", targetUserId: userId, ip, meta: { type } },
  });

  return Response.json({ ok: true });
}
