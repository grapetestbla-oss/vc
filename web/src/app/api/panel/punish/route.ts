import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { canLift, canPunish, issueBan, issueJail, issueWarn, liftPunishment } from "@/lib/punishments";
import { clientIp } from "@/lib/audit";

/** Наказания игрока — для карточки и для снятия. */
export async function GET(request: Request) {
  const admin = await requirePanel(3);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const login = url.searchParams.get("login");
  const userId = url.searchParams.get("userId");
  if (!login && !userId) return Response.json({ error: "login required" }, { status: 400 });

  const user = await db.user.findFirst({
    where: userId ? { id: userId } : { login: login! },
    select: { id: true },
  });
  if (!user) return Response.json({ error: "Игрок не найден" }, { status: 404 });

  const punishments = await db.punishment.findMany({
    where: { userId: user.id },
    orderBy: { issuedAt: "desc" },
    take: 50,
    include: { by: { select: { login: true, adminLevel: true } } },
  });

  return Response.json({
    punishments: punishments.map((punishment) => ({
      id: punishment.id,
      type: punishment.type,
      reason: punishment.reason,
      active: punishment.active,
      issuedAt: punishment.issuedAt,
      expiresAt: punishment.expiresAt,
      liftedAt: punishment.liftedAt,
      by: punishment.by?.login ?? null,
      // Может ли этот администратор снять именно это наказание.
      canLift:
        canLift(admin.adminLevel, punishment.type) === null &&
        (punishment.by?.adminLevel ?? 0) <= admin.adminLevel,
    })),
  });
}

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

/** Снятие наказания: досрочный выпуск, отмена варна, разбан. */
export async function DELETE(request: Request) {
  const admin = await requirePanel(3);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { punishmentId, note } = (await request.json()) as {
    punishmentId?: string;
    note?: string;
  };
  if (!punishmentId) return Response.json({ error: "punishmentId required" }, { status: 400 });

  const punishment = await db.punishment.findUnique({
    where: { id: punishmentId },
    include: { by: { select: { adminLevel: true } } },
  });
  if (!punishment) return Response.json({ error: "Наказание не найдено" }, { status: 404 });
  if (!punishment.active) return Response.json({ error: "Уже снято" }, { status: 409 });

  const denied = canLift(admin.adminLevel, punishment.type);
  if (denied) return Response.json({ error: denied }, { status: 403 });

  // Чужое наказание от старшего по уровню младший не отменяет.
  if ((punishment.by?.adminLevel ?? 0) > admin.adminLevel) {
    return Response.json(
      { error: "Наказание выдал администратор выше уровнем" },
      { status: 403 },
    );
  }

  await liftPunishment(punishmentId, admin.id);
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: "admin.punish.lift",
      targetUserId: punishment.userId,
      ip: clientIp(request),
      meta: { type: punishment.type, punishmentId, note: (note ?? "").slice(0, 300) || null },
    },
  });

  return Response.json({ ok: true, type: punishment.type });
}
