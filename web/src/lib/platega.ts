import { timingSafeEqual } from "node:crypto";
import type { PlategaConfig } from "./payments";

/**
 * Платега (platega.io). Ключи идут в заголовках X-MerchantId и X-Secret;
 * уведомление об оплате касса шлёт с ними же — по ним её и опознаём, отдельной
 * подписи в протоколе нет.
 *
 * Счёт создаём через v2. Старый /transaction/process требует paymentMethod и
 * отказывает, если способ не задан или выбран картой без каскада («No available
 * card cascades»); в v2 способ необязателен — его выбирает игрок на странице
 * кассы, — а ссылка приходит в поле url вместо redirect. Путь вынесен в
 * настройки: если касса снова переедет, это правится без пересборки.
 */
export const PLATEGA_PATH = "/v2/transaction/process";

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

  const response = await fetch(new URL(config.path || PLATEGA_PATH, config.apiUrl), {
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

  // В v2 ссылка приходит в url, в v1 — в redirect.
  const redirect = (data.url ?? data.redirect ?? data.paymentUrl) as string | undefined;
  const transactionId = (data.transactionId ?? data.id) as string | undefined;
  if (!redirect) {
    // Тело ответа кладём в ошибку: без него в журнале остаётся «нет ссылки», и
    // разбираться приходится вслепую.
    throw new Error(`Платега не прислала ссылку на оплату: ${text.slice(0, 300)}`);
  }

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
  const details = (body.paymentDetails ?? {}) as Record<string, unknown>;
  const payload = typeof body.payload === "string" ? body.payload : null;

  // Сумма может лежать и в paymentDetails — так она приходит при создании
  // счёта. Без этого запаса ноль сравнивался бы с суммой счёта, и оплаченный
  // счёт отбивался бы как «недоплата».
  const amount = Number(body.amount ?? details.amount ?? 0);

  return {
    transactionId: String(body.transactionId ?? body.id ?? ""),
    orderId:
      payload ??
      (typeof metadata.orderId === "string" ? metadata.orderId : null) ??
      (typeof body.orderId === "string" ? body.orderId : null),
    amount,
    status: String(body.status ?? "").toUpperCase(),
  };
}
