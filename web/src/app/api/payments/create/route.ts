import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import { audit, clientIp } from "@/lib/audit";

/**
 * Заготовка под платёжный провайдер. Создаёт платёж в статусе pending и
 * возвращает ссылку на оплату. Конкретный провайдер (ЮKassa, EasyDonate,
 * Tebex) подключается здесь — начисление VC делает его вебхук, не эта ручка.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { vcAmount } = (await request.json()) as { vcAmount?: number };
  const amount = Math.floor(vcAmount ?? 0);
  if (amount < 100 || amount > 500_000) {
    return Response.json({ error: "Сумма от 100 до 500000 VC" }, { status: 400 });
  }

  const amountRub = Math.ceil((amount / 100) * CONFIG.rubPer100Vc);
  const payment = await db.payment.create({
    data: { userId: user.id, vcAmount: amount, amountRub, provider: "manual", status: "pending" },
  });
  await audit({
    actorId: user.id,
    action: "payment.create",
    ip: clientIp(request),
    meta: { paymentId: payment.id, amountRub, vcAmount: amount },
  });

  return Response.json({
    paymentId: payment.id,
    amountRub,
    vcAmount: amount,
    // Пока провайдер не подключён — платёж подтверждается вручную в админ-панели.
    payUrl: null,
  });
}
