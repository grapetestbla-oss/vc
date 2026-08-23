import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";
import { CONFIG } from "@/lib/config";

export async function POST(request: Request) {
  const admin = await requirePanel(5);
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
