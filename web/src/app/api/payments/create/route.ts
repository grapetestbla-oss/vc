import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import { audit, clientIp } from "@/lib/audit";
import { freekassaConfigured, paymentUrl } from "@/lib/freekassa";

/**
 * Заявка на пополнение. Провайдер не подключён: игрок присылает сумму,
 * способ перевода и контакт, а чиф-администратор сверяет перевод в панели
 * и одобряет заявку — только тогда начисляются VC.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    amountRub?: number;
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

  const auto = freekassaConfigured();
  const method = (body.method ?? "").trim().slice(0, 40);
  const contact = (body.contact ?? "").trim().slice(0, 120);
  const comment = (body.comment ?? "").trim().slice(0, 500);

  // При автоматической оплате способ и контакт спрашивать незачем: платёж
  // подтвердит сам провайдер, а связь с игроком идёт через аккаунт.
  if (!auto) {
    if (!method) return Response.json({ error: "Укажите способ оплаты" }, { status: 400 });
    if (contact.length < 3) {
      return Response.json({ error: "Оставьте контакт для связи" }, { status: 400 });
    }
  }

  // Одна открытая заявка на аккаунт: иначе админ разбирает пачку дублей.
  // При автоматической оплате ограничение не нужно — счета никто не разбирает
  // руками, а брошенный счёт просто остаётся неоплаченным.
  if (!freekassaConfigured()) {
    const pending = await db.payment.count({ where: { userId: user.id, status: "pending" } });
    if (pending > 0) {
      return Response.json({ error: "У вас уже есть заявка на рассмотрении" }, { status: 409 });
    }
  }

  const vcAmount = amountRub * CONFIG.vcPerRub;
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      amountRub,
      vcAmount,
      provider: auto ? "freekassa" : "manual",
      status: "pending",
      method: auto ? "FreeKassa" : method,
      contact: auto ? user.email : contact,
      comment: comment || null,
    },
  });
  await audit({
    actorId: user.id,
    action: "payment.request",
    ip: clientIp(request),
    meta: { paymentId: payment.id, amountRub, vcAmount, provider: payment.provider },
  });

  return Response.json({
    ok: true,
    paymentId: payment.id,
    amountRub,
    vcAmount,
    // Автоматический режим: игрока сразу отправляем на страницу оплаты.
    payUrl: auto ? paymentUrl({ orderId: payment.id, amountRub, email: user.email }) : null,
  });
}
