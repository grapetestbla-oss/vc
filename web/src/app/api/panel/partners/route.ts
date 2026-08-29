import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";
import { CONFIG } from "@/lib/config";

/**
 * Решение по заявке. Одобрение выдаёт статус media (1 уровень) и создаёт
 * промокод партнёра — тот самый, который игроки вводят при регистрации.
 */
export async function POST(request: Request) {
  const admin = await requirePanel(4, "partners.review");
  if (!admin) return Response.json({ error: "Нужен 4 уровень" }, { status: 403 });

  const { id, approve, note, code } = (await request.json()) as {
    id?: string;
    approve?: boolean;
    note?: string;
    code?: string;
  };
  if (!id) return Response.json({ error: "id обязателен" }, { status: 400 });

  const application = await db.partnerApplication.findUnique({
    where: { id },
    include: { user: { select: { id: true, login: true, adminLevel: true } } },
  });
  if (!application) return Response.json({ error: "Заявка не найдена" }, { status: 404 });
  if (application.status !== "PENDING") {
    return Response.json({ error: "Заявка уже рассмотрена" }, { status: 409 });
  }

  if (!approve) {
    await db.partnerApplication.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewNote: note?.slice(0, 500) ?? null,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    });
    await audit({
      actorId: admin.id,
      action: "partner.reject",
      targetUserId: application.userId,
      ip: clientIp(request),
      meta: { note: note ?? null },
    });
    return Response.json({ ok: true });
  }

  const promoCode = (code || application.desiredCode || application.user.login)
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9_]{3,16}$/.test(promoCode)) {
    return Response.json({ error: "Код: 3-16 символов, латиница, цифры и _" }, { status: 400 });
  }

  const existing = await db.promo.findUnique({ where: { code: promoCode } });
  if (existing && existing.partnerId !== application.userId) {
    return Response.json({ error: "Такой код уже занят" }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    if (!existing) {
      await tx.promo.create({
        data: {
          code: promoCode,
          partnerId: application.userId,
          rewardVc: CONFIG.promoReward,
          requiredLevel: CONFIG.promoRequiredLevel,
          createdById: admin.id,
        },
      });
    }
    // Статус media — первый уровень: красный ESP и локальные погода со временем.
    if (application.user.adminLevel < 1) {
      await tx.user.update({ where: { id: application.userId }, data: { adminLevel: 1 } });
    }
    await tx.partnerApplication.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewNote: note?.slice(0, 500) ?? null,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    });
  });

  await audit({
    actorId: admin.id,
    action: "partner.approve",
    targetUserId: application.userId,
    ip: clientIp(request),
    meta: { code: promoCode },
  });

  return Response.json({ ok: true, code: promoCode });
}
