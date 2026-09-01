import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import { audit, clientIp } from "@/lib/audit";
import { paymentUrl } from "@/lib/freekassa";
import { createTransaction } from "@/lib/platega";
import {
  activeProviders,
  bonusPercentOf,
  getPaymentConfig,
  vcForRub,
  type ProviderKey,
} from "@/lib/payments";

/**
 * Счёт на пополнение. Если касса подключена — игрока сразу уводим на её
 * страницу оплаты, а VC начислит уведомление. Если ни одной кассы нет,
 * остаётся ручной путь: заявку сверяет и одобряет чиф-администратор.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    amountRub?: number;
    provider?: string;
    method?: string;
    contact?: string;
    comment?: string;
  };

  const amountRub = Math.floor(Number(body.amountRub ?? 0));
  if (!Number.isFinite(amountRub) || amountRub < CONFIG.minTopUpRub || amountRub > CONFIG.maxTopUpRub) {
    return Response.json(
      { error: `Сумма от ${CONFIG.minTopUpRub} до ${CONFIG.maxTopUpRub} ₽` },
      { status: 400 },
    );
  }

  const config = await getPaymentConfig();
  const available = activeProviders(config);
  if (available.length === 0) {
    return Response.json({ error: "Пополнение временно недоступно" }, { status: 503 });
  }

  const asked = (body.provider ?? "").trim() as ProviderKey;
  const chosen = available.find((item) => item.key === asked) ?? available[0];
  const provider = chosen.key;
  const auto = provider !== "manual";

  const method = (body.method ?? "").trim().slice(0, 40);
  const contact = (body.contact ?? "").trim().slice(0, 120);
  const comment = (body.comment ?? "").trim().slice(0, 500);

  // При автоматической оплате способ и контакт спрашивать незачем: платёж
  // подтвердит сама касса, а связь с игроком идёт через аккаунт.
  if (!auto) {
    if (!method) return Response.json({ error: "Укажите способ оплаты" }, { status: 400 });
    if (contact.length < 3) {
      return Response.json({ error: "Оставьте контакт для связи" }, { status: 400 });
    }

    // Одна открытая заявка на аккаунт: иначе админ разбирает пачку дублей.
    // При автоматической оплате ограничение не нужно — счета никто не разбирает
    // руками, а брошенный счёт просто остаётся неоплаченным.
    const pending = await db.payment.count({
      where: { userId: user.id, status: "pending", provider: "manual" },
    });
    if (pending > 0) {
      return Response.json({ error: "У вас уже есть заявка на рассмотрении" }, { status: 409 });
    }
  }

  const { vc, bonus } = vcForRub(amountRub, bonusPercentOf(config, provider));
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      amountRub,
      vcAmount: vc,
      bonusVc: bonus,
      provider,
      status: "pending",
      method: auto ? chosen.title : method,
      contact: auto ? user.email : contact,
      comment: comment || null,
    },
  });

  let payUrl: string | null = null;
  if (provider === "freekassa") {
    payUrl = paymentUrl(config.freekassa, { orderId: payment.id, amountRub, email: user.email });
  } else if (provider === "platega") {
    const origin = new URL(request.url).origin;
    try {
      const transaction = await createTransaction(config.platega, {
        orderId: payment.id,
        amountRub,
        description: `Пополнение VanillaCoins, ${user.login}`,
        returnUrl: `${origin}/topup?paid=1`,
        failedUrl: `${origin}/topup?failed=1`,
      });
      payUrl = transaction.redirect;
      if (transaction.transactionId) {
        await db.payment.update({
          where: { id: payment.id },
          data: { providerId: transaction.transactionId },
        });
      }
    } catch (error) {
      // Счёт оставляем в ожидании, а не отклоняем. Отказ мог случиться уже
      // после того, как касса завела транзакцию у себя: тогда деньги придут, а
      // зачислить их на отклонённый счёт уведомление уже не сможет.
      await db.payment.update({
        where: { id: payment.id },
        data: { reviewNote: "Ссылка на оплату не получена" },
      });
      await audit({
        actorId: user.id,
        action: "payment.platega.create-failed",
        ip: clientIp(request),
        meta: { paymentId: payment.id, amountRub, error: String(error).slice(0, 300) },
      });
      return Response.json({ error: "Касса не отвечает, попробуйте позже" }, { status: 502 });
    }
  }

  await audit({
    actorId: user.id,
    action: "payment.request",
    ip: clientIp(request),
    meta: { paymentId: payment.id, amountRub, vcAmount: vc, bonusVc: bonus, provider },
  });

  return Response.json({
    ok: true,
    paymentId: payment.id,
    amountRub,
    vcAmount: vc,
    bonusVc: bonus,
    provider,
    // Автоматическая оплата: игрока сразу отправляем на страницу кассы.
    payUrl,
  });
}
