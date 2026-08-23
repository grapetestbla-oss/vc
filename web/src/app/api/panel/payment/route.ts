import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { applyTransaction } from "@/lib/economy";
import { audit, clientIp } from "@/lib/audit";

/** Ручное подтверждение платежа, пока провайдер не подключён. */
export async function POST(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { paymentId } = (await request.json()) as { paymentId?: string };
  if (!paymentId) return Response.json({ error: "paymentId required" }, { status: 400 });

  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return Response.json({ error: "Не найден" }, { status: 404 });
  if (payment.status === "paid") return Response.json({ error: "Уже оплачен" }, { status: 409 });

  await db.payment.update({
    where: { id: paymentId },
    data: { status: "paid", paidAt: new Date() },
  });
  const balance = await applyTransaction({
    userId: payment.userId,
    type: "TOPUP",
    amount: payment.vcAmount,
    meta: { paymentId, amountRub: payment.amountRub, confirmedBy: admin.login },
  });
  await audit({
    actorId: admin.id,
    action: "admin.payment.confirm",
    targetUserId: payment.userId,
    ip: clientIp(request),
    meta: { paymentId, vcAmount: payment.vcAmount },
  });

  return Response.json({ ok: true, balance });
}
