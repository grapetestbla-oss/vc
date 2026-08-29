import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";

export async function POST(request: Request) {
  const admin = await requirePanel(5, "promos.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { code, rewardVc, maxUses, expiresAt } = (await request.json()) as {
    code?: string;
    rewardVc?: number;
    maxUses?: number;
    expiresAt?: string | null;
  };
  if (!code?.trim() || !rewardVc || !maxUses) {
    return Response.json({ error: "Нужны код, награда и лимит" }, { status: 400 });
  }

  try {
    const bonus = await db.bonusCode.create({
      data: {
        code: code.trim().toUpperCase(),
        rewardVc: Math.floor(rewardVc),
        maxUses: Math.floor(maxUses),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById: admin.id,
      },
    });
    await audit({
      actorId: admin.id,
      action: "admin.bonus.create",
      ip: clientIp(request),
      meta: { code: bonus.code, rewardVc: bonus.rewardVc, maxUses: bonus.maxUses },
    });
    return Response.json({ ok: true, code: bonus.code });
  } catch {
    return Response.json({ error: "Такой код уже есть" }, { status: 409 });
  }
}
