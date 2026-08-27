import { db } from "@/lib/db";
import { applyTransaction } from "@/lib/economy";
import { audit, clientIp } from "@/lib/audit";
import { payPartnerShare } from "@/lib/partnershare";
import { ipAllowed, notificationValid, parseNotification } from "@/lib/freekassa";

/** Форму FreeKassa шлёт как application/x-www-form-urlencoded. */
async function readForm(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return (await request.json()) as Record<string, string>;
  }
  const form = await request.formData();
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) values[key] = String(value);
  return values;
}

/**
 * Уведомление об оплате. Деньги начисляет только эта ручка и только после
 * проверки подписи вторым секретом: без неё платёж подделывается запросом.
 * FreeKassa повторяет уведомление, пока не получит «YES», поэтому обработка
 * идемпотентна — второй раз VC не начисляются.
 */
export async function POST(request: Request) {
  const form = await readForm(request);
  const ip = clientIp(request);

  if (!ipAllowed(ip)) {
    await audit({ actorId: null, action: "payment.freekassa.bad-ip", ip, meta: { form } });
    return new Response("bad ip", { status: 403 });
  }
  if (!notificationValid(form)) {
    await audit({ actorId: null, action: "payment.freekassa.bad-sign", ip, meta: { form } });
    return new Response("bad sign", { status: 400 });
  }

  const notification = parseNotification(form);
  const payment = await db.payment.findUnique({ where: { id: notification.orderId } });
  if (!payment) {
    await audit({
      actorId: null,
      action: "payment.freekassa.unknown-order",
      ip,
      meta: { orderId: notification.orderId },
    });
    return new Response("unknown order", { status: 404 });
  }

  // Заплатили меньше выставленного — не начисляем: разберёт администрация.
  if (notification.amount + 0.01 < payment.amountRub) {
    await audit({
      actorId: null,
      action: "payment.freekassa.amount-mismatch",
      targetUserId: payment.userId,
      ip,
      meta: { expected: payment.amountRub, got: notification.amount },
    });
    return new Response("amount mismatch", { status: 400 });
  }

  // Повтор уведомления: платёж уже проведён — просто подтверждаем приём.
  const claimed = await db.payment.updateMany({
    where: { id: payment.id, status: "pending" },
    data: {
      status: "paid",
      paidAt: new Date(),
      providerId: notification.transactionId,
      reviewNote: "Автоматически: FreeKassa",
    },
  });
  if (claimed.count === 0) return new Response("YES");

  const balance = await applyTransaction({
    userId: payment.userId,
    type: "TOPUP",
    amount: payment.vcAmount,
    meta: {
      paymentId: payment.id,
      amountRub: payment.amountRub,
      provider: "freekassa",
      transactionId: notification.transactionId,
    },
  });

  const share = await payPartnerShare({
    userId: payment.userId,
    creditedVc: payment.vcAmount,
    paymentId: payment.id,
  });

  await audit({
    actorId: null,
    action: "payment.freekassa.paid",
    targetUserId: payment.userId,
    ip,
    meta: {
      paymentId: payment.id,
      amountRub: payment.amountRub,
      vcAmount: payment.vcAmount,
      balance,
      partnerShare: share,
      transactionId: notification.transactionId,
    },
  });

  return new Response("YES");
}
