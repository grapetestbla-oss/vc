import { db } from "./db";
import { creditPayment, getPaymentConfig, plategaReady } from "./payments";
import { transactionStatus } from "./platega";
import { audit } from "./audit";

/**
 * Досверка счетов Платеги.
 *
 * Уведомление от кассы — не единственный источник правды: оно может не дойти,
 * прийти с задержкой или упереться в нашу же ошибку. Тогда игрок видит
 * оплаченный счёт у кассы и ничего у нас, и ждёт, пока счёт протухнет. Здесь мы
 * спрашиваем кассу сами: статус счёта она отдаёт по его номеру.
 *
 * Зачисляет по-прежнему creditPayment — то же условное обновление, что и у
 * уведомления, поэтому одновременная досверка и уведомление не начислят дважды.
 */

/** Дольше этого счёт не проверяем: у кассы он всё равно протух. */
const MAX_AGE_HOURS = 6;

export type SyncedPayment = { paymentId: string; status: string; credited: boolean };

export async function syncPlategaPayments(userId?: string): Promise<SyncedPayment[]> {
  const config = await getPaymentConfig();
  if (!plategaReady(config)) return [];

  const pending = await db.payment.findMany({
    where: {
      provider: "platega",
      status: "pending",
      providerId: { not: null },
      createdAt: { gt: new Date(Date.now() - MAX_AGE_HOURS * 3600_000) },
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const results: SyncedPayment[] = [];
  for (const payment of pending) {
    if (!payment.providerId) continue;

    let state;
    try {
      state = await transactionStatus(config.platega, payment.providerId);
    } catch (error) {
      await audit({
        actorId: null,
        action: "payment.platega.status-failed",
        targetUserId: payment.userId,
        meta: { paymentId: payment.id, error: String(error).slice(0, 200) },
      });
      continue;
    }

    if (state.status === "CONFIRMED") {
      // Недоплату не зачисляем — как и в уведомлении, разберёт администрация.
      if (state.amount > 0 && state.amount + 0.01 < payment.amountRub) {
        await audit({
          actorId: null,
          action: "payment.platega.amount-mismatch",
          targetUserId: payment.userId,
          meta: { paymentId: payment.id, expected: payment.amountRub, got: state.amount },
        });
        results.push({ paymentId: payment.id, status: state.status, credited: false });
        continue;
      }

      const { credited } = await creditPayment({
        paymentId: payment.id,
        providerId: payment.providerId,
        note: "Автоматически: Платега (досверка)",
      });
      results.push({ paymentId: payment.id, status: state.status, credited });
      continue;
    }

    if (state.status === "CANCELED" || state.status === "EXPIRED" || state.status === "FAILED") {
      await db.payment.updateMany({
        where: { id: payment.id, status: "pending" },
        data: { status: "rejected", reviewNote: `Платега: ${state.status.toLowerCase()}` },
      });
    }
    results.push({ paymentId: payment.id, status: state.status, credited: false });
  }

  return results;
}
