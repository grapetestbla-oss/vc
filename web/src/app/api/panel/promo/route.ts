import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";
import { CONFIG } from "@/lib/config";

export async function POST(request: Request) {
  const admin = await requirePanel(5, "promos.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { code, partnerLogin, rewardVc, requiredLevel } = (await request.json()) as {
    code?: string;
    partnerLogin?: string;
    rewardVc?: number;
    requiredLevel?: number;
  };
  if (!code?.trim()) return Response.json({ error: "Нужен код" }, { status: 400 });

  const partner = partnerLogin
    ? await db.user.findUnique({ where: { login: partnerLogin } })
    : null;
  if (partnerLogin && !partner) {
    return Response.json({ error: "Партнёр не найден" }, { status: 404 });
  }

  try {
    const promo = await db.promo.create({
      data: {
        code: code.trim().toUpperCase(),
        partnerId: partner?.id ?? null,
        rewardVc: rewardVc ?? CONFIG.promoReward,
        requiredLevel: requiredLevel ?? CONFIG.promoRequiredLevel,
        createdById: admin.id,
      },
    });
    await audit({
      actorId: admin.id,
      action: "admin.promo.create",
      ip: clientIp(request),
      meta: { code: promo.code, partner: partnerLogin ?? null },
    });
    return Response.json({ ok: true, code: promo.code });
  } catch {
    return Response.json({ error: "Такой код уже есть" }, { status: 409 });
  }
}

/** Правка существующего промокода: награда, нужный уровень, включён ли он. */
export async function PATCH(request: Request) {
  const admin = await requirePanel(5, "promos.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { code, rewardVc, requiredLevel, active } = (await request.json()) as {
    code?: string;
    rewardVc?: number;
    requiredLevel?: number;
    active?: boolean;
  };
  if (!code?.trim()) return Response.json({ error: "Нужен код" }, { status: 400 });

  const promo = await db.promo.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo) return Response.json({ error: "Промокод не найден" }, { status: 404 });

  const reward = rewardVc === undefined ? promo.rewardVc : Math.floor(rewardVc);
  const level = requiredLevel === undefined ? promo.requiredLevel : Math.floor(requiredLevel);
  if (!Number.isFinite(reward) || reward < 0 || reward > 100_000) {
    return Response.json({ error: "Награда от 0 до 100000 VC" }, { status: 400 });
  }
  if (!Number.isFinite(level) || level < 0 || level > 50) {
    return Response.json({ error: "Уровень от 0 до 50" }, { status: 400 });
  }

  const updated = await db.promo.update({
    where: { id: promo.id },
    data: {
      rewardVc: reward,
      requiredLevel: level,
      active: active === undefined ? promo.active : active,
    },
  });
  await audit({
    actorId: admin.id,
    action: "admin.promo.update",
    ip: clientIp(request),
    meta: {
      code: updated.code,
      before: { rewardVc: promo.rewardVc, requiredLevel: promo.requiredLevel, active: promo.active },
      after: { rewardVc: updated.rewardVc, requiredLevel: updated.requiredLevel, active: updated.active },
    },
  });

  // Уже выданные награды не пересчитываем: это была бы правка истории.
  return Response.json({
    ok: true,
    code: updated.code,
    rewardVc: updated.rewardVc,
    requiredLevel: updated.requiredLevel,
    active: updated.active,
  });
}
