import { db } from "@/lib/db";
import { audit, clientIp } from "@/lib/audit";
import { callbackValid, parseCallback } from "@/lib/platega";
import { creditPayment, getPaymentConfig, plategaReady } from "@/lib/payments";

/**
 * Уведомление Платеги. Касса подтверждает себя заголовками X-MerchantId и
 * X-Secret — их и проверяем, прежде чем что-то начислять. Ответ нужен за
 * 60 секунд, иначе уведомление повторят: обработка идемпотентна.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const config = await getPaymentConfig();

  if (!plategaReady(config)) {
    await audit({ actorId: null, action: "payment.platega.disabled", ip });
    return new Response("disabled", { status: 503 });
  }
  if (!callbackValid(config.platega, request.headers)) {
    await audit({ actorId: null, action: "payment.platega.bad-secret", ip });
    return new Response("bad secret", { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const callback = parseCallback(body);

  // Счёт ищем по номеру транзакции кассы, а если его не сохранили — по своему
  // номеру, который касса возвращает в payload.
  const payment =
    (callback.transactionId
      ? await db.payment.findUnique({ where: { providerId: callback.transactionId } })
      : null) ??
    (callback.orderId ? await db.payment.findUnique({ where: { id: callback.orderId } }) : null);

  if (!payment || payment.provider !== "platega") {
    await audit({
      actorId: null,
      action: "payment.platega.unknown-order",
      ip,
      meta: {
        transactionId: callback.transactionId,
        orderId: callback.orderId,
        // Тело кладём целиком (обрезанным): без него не видно, какими полями
        // касса вообще прислала уведомление.
        body: JSON.stringify(body).slice(0, 500),
      },
    });
    return new Response("unknown order", { status: 404 });
  }

  if (callback.status !== "CONFIRMED") {
    // Отменённый счёт закрываем, чтобы он не висел у игрока в «на рассмотрении».
    if (payment.status === "pending") {
      await db.payment.updateMany({
        where: { id: payment.id, status: "pending" },
        data: { status: "rejected", reviewNote: `Платега: ${callback.status || "отменено"}` },
      });
    }
    await audit({
      actorId: null,
      action: "payment.platega.not-paid",
      targetUserId: payment.userId,
      ip,
      meta: { paymentId: payment.id, status: callback.status },
    });
    return new Response("ok");
  }

  // Заплатили меньше выставленного — не начисляем: разберёт администрация.
  if (callback.amount + 0.01 < payment.amountRub) {
    await audit({
      actorId: null,
      action: "payment.platega.amount-mismatch",
      targetUserId: payment.userId,
      ip,
      meta: { paymentId: payment.id, expected: payment.amountRub, got: callback.amount },
    });
    return new Response("amount mismatch", { status: 400 });
  }

  await creditPayment({
    paymentId: payment.id,
    providerId: callback.transactionId || payment.providerId,
    note: "Автоматически: Платега",
  });

  return new Response("ok");
}
