import { createHash } from "node:crypto";
import type { FreeKassaConfig } from "./payments";

/**
 * FreeKassa, протокол SCI. Подпись формы — md5(магазин:сумма:секрет1:валюта:заказ),
 * подпись уведомления — md5(магазин:сумма:секрет2:заказ). Ключи приходят из
 * настроек касс: их заводит чиф-администратор в панели.
 */

/**
 * С этих адресов приходят уведомления. Список меняется, поэтому вынесен в
 * переменную окружения; пустое значение выключает проверку.
 */
const ALLOWED_IPS = (
  process.env.FREEKASSA_IPS ?? "168.119.157.136,168.119.60.227,178.154.197.79,51.250.54.238"
)
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

/** Ссылка на оплату: сумму и номер заказа подписываем первым секретом. */
export function paymentUrl(
  config: FreeKassaConfig,
  params: { orderId: string; amountRub: number; email?: string | null },
): string {
  const amount = params.amountRub.toFixed(2);
  const signature = md5(
    [config.merchantId, amount, config.secret1, config.currency, params.orderId].join(":"),
  );

  const url = new URL(config.payUrl);
  url.searchParams.set("m", config.merchantId);
  url.searchParams.set("oa", amount);
  url.searchParams.set("currency", config.currency);
  url.searchParams.set("o", params.orderId);
  url.searchParams.set("s", signature);
  url.searchParams.set("lang", "ru");
  if (params.email) url.searchParams.set("em", params.email);
  return url.toString();
}

export type Notification = {
  orderId: string;
  amount: number;
  merchantId: string;
  sign: string;
  transactionId: string | null;
  payerAccount: string | null;
};

export function parseNotification(form: Record<string, string>): Notification {
  return {
    orderId: form.MERCHANT_ORDER_ID ?? "",
    amount: Number(form.AMOUNT ?? "0"),
    merchantId: form.MERCHANT_ID ?? "",
    sign: (form.SIGN ?? "").toLowerCase(),
    transactionId: form.intid ?? null,
    payerAccount: form.P_EMAIL ?? form.payer_account ?? null,
  };
}

/** Подпись уведомления. Сумму берём строкой как прислали: пересчёт ломает хэш. */
export function notificationValid(config: FreeKassaConfig, form: Record<string, string>): boolean {
  const expected = md5(
    [form.MERCHANT_ID ?? "", form.AMOUNT ?? "", config.secret2, form.MERCHANT_ORDER_ID ?? ""].join(
      ":",
    ),
  );
  return expected === (form.SIGN ?? "").toLowerCase() && (form.MERCHANT_ID ?? "") === config.merchantId;
}

/** Проверка адреса отправителя. Пустой список в настройках выключает её. */
export function ipAllowed(ip: string | null): boolean {
  if (ALLOWED_IPS.length === 0) return true;
  if (!ip) return false;
  // За Caddy адрес приходит списком: берём первый, он и есть отправитель.
  const source = ip.split(",")[0].trim();
  return ALLOWED_IPS.includes(source);
}
