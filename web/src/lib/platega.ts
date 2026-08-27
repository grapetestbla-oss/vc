import { timingSafeEqual } from "node:crypto";
import type { PlategaConfig } from "./payments";

/**
 * Платега (platega.io). Счёт создаётся запросом POST /transaction/process с
 * ключами в заголовках X-MerchantId и X-Secret; в ответ приходит ссылка на
 * оплату. Уведомление об оплате касса шлёт с теми же заголовками — по ним её
 * и опознаём, отдельной подписи в протоколе нет.
 */
export type PlategaTransaction = {
  transactionId: string;
  redirect: string;
};

export async function createTransaction(
  config: PlategaConfig,
  params: {
    orderId: string;
    amountRub: number;
    description: string;
    returnUrl: string;
    failedUrl: string;
  },
): Promise<PlategaTransaction> {
  const body: Record<string, unknown> = {
    paymentDetails: { amount: params.amountRub, currency: config.currency },
    description: params.description,
    return: params.returnUrl,
    failedUrl: params.failedUrl,
    // Свой номер счёта кладём в payload: он вернётся в уведомлении и по нему
    // счёт находится, даже если ответ с transactionId потерялся.
    payload: params.orderId,
    metadata: { orderId: params.orderId },
  };
  // 0 — метод выбирает сам игрок на странице кассы.
  if (config.paymentMethod > 0) body.paymentMethod = config.paymentMethod;

  const response = await fetch(new URL("/transaction/process", config.apiUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MerchantId": config.merchantId,
      "X-Secret": config.secret,
    },
    body: JSON.stringify(body),
    // Касса не отвечает — игрок не должен ждать вечно на кнопке оплаты.
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Платега ответила ${response.status}: ${text.slice(0, 200)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Платега прислала не JSON");
  }

  // В новой версии ссылка приходит в поле url, в старой — в redirect.
  const redirect = (data.redirect ?? data.url ?? data.paymentUrl) as string | undefined;
  const transactionId = (data.transactionId ?? data.id) as string | undefined;
  if (!redirect) throw new Error("Платега не прислала ссылку на оплату");

  return { transactionId: transactionId ?? "", redirect };
}

function sameSecret(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/** Уведомление принимаем только от своей кассы: сверяем оба ключа. */
export function callbackValid(config: PlategaConfig, headers: Headers): boolean {
  const merchant = headers.get("x-merchantid") ?? "";
  const secret = headers.get("x-secret") ?? "";
  return sameSecret(merchant, config.merchantId) && sameSecret(secret, config.secret);
}

export type PlategaCallback = {
  transactionId: string;
  orderId: string | null;
  amount: number;
  status: string;
};

export function parseCallback(body: Record<string, unknown>): PlategaCallback {
  const metadata = (body.metadata ?? {}) as Record<string, unknown>;
  const payload = typeof body.payload === "string" ? body.payload : null;
  return {
    transactionId: String(body.id ?? body.transactionId ?? ""),
    orderId: payload ?? (typeof metadata.orderId === "string" ? metadata.orderId : null),
    amount: Number(body.amount ?? 0),
    status: String(body.status ?? "").toUpperCase(),
  };
}
