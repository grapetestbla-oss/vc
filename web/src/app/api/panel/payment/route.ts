import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { applyTransaction } from "@/lib/economy";
import { audit, clientIp } from "@/lib/audit";

/** Разбор заявки на пополнение. Одобряет и отклоняет только 5 уровень. */
export async function POST(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { paymentId, action, note } = (await request.json()) as {
    paymentId?: string;
    action?: "approve" | "reject";
    note?: string;
  };
  if (!paymentId) return Response.json({ error: "paymentId required" }, { status: 400 });
  const verdict = action ?? "approve";
  if (verdict !== "approve" && verdict !== "reject") {
    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  }

  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return Response.json({ error: "Не найдена" }, { status: 404 });
  if (payment.status !== "pending") {
    return Response.json({ error: "Заявка уже разобрана" }, { status: 409 });
  }

  const reviewNote = (note ?? "").trim().slice(0, 500) || null;

  if (verdict === "reject") {
    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: "rejected",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewNote,
      },
    });
    await audit({
      actorId: admin.id,
      action: "admin.payment.reject",
      targetUserId: payment.userId,
      ip: clientIp(request),
      meta: { paymentId, amountRub: payment.amountRub, note: reviewNote },
    });
    return Response.json({ ok: true, status: "rejected" });
  }

  // Статус меняем условно: два администратора не начислят одну заявку дважды.
  const claimed = await db.payment.updateMany({
    where: { id: paymentId, status: "pending" },
    data: {
      status: "paid",
      paidAt: new Date(),
      reviewedById: admin.id,
      reviewedAt: new Date(),
      reviewNote,
    },
  });
  if (claimed.count === 0) {
    return Response.json({ error: "Заявку уже разобрали" }, { status: 409 });
  }

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
    meta: { paymentId, vcAmount: payment.vcAmount, amountRub: payment.amountRub },
  });

  return Response.json({ ok: true, status: "paid", balance });
}
