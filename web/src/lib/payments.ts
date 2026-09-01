import { db } from "./db";
import { audit } from "./audit";
import { CONFIG } from "./config";
import { applyTransaction } from "./economy";
import { payPartnerShare } from "./partnershare";

/**
 * Настройки приёма платежей. Ключи касс лежат в базе, а не в окружении:
 * чиф-администратор подключает и переключает кассы из панели, без пересборки
 * сайта. Значения из окружения остаются значениями по умолчанию — так уже
 * поднятые сервера продолжают работать без переноса ключей.
 */
export type ProviderKey = "freekassa" | "platega" | "manual";

export type FreeKassaConfig = {
  enabled: boolean;
  /** Бонус к VC в процентах от суммы: 14 → за 1000 ₽ дадут 2280 VC. */
  bonusPercent: number;
  merchantId: string;
  secret1: string;
  secret2: string;
  payUrl: string;
  currency: string;
};

export type PlategaConfig = {
  enabled: boolean;
  bonusPercent: number;
  merchantId: string;
  secret: string;
  /** Метод оплаты Платеги: 0 — игрок выбирает сам на их странице. */
  paymentMethod: number;
  apiUrl: string;
  /** Путь создания счёта. Меняется без пересборки, если касса переедет. */
  path: string;
  currency: string;
};

export type ManualConfig = {
  /** null — показывать только когда ни одна касса не подключена. */
  enabled: boolean | null;
  bonusPercent: number;
};

export type PaymentConfig = {
  freekassa: FreeKassaConfig;
  platega: PlategaConfig;
  manual: ManualConfig;
};

const KEY = "payments";

function str(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function defaults(): PaymentConfig {
  return {
    freekassa: {
      enabled: true,
      bonusPercent: 0,
      merchantId: str("FREEKASSA_MERCHANT_ID"),
      secret1: str("FREEKASSA_SECRET1"),
      secret2: str("FREEKASSA_SECRET2"),
      payUrl: str("FREEKASSA_PAY_URL", "https://pay.fk.money/"),
      currency: str("FREEKASSA_CURRENCY", "RUB"),
    },
    platega: {
      enabled: true,
      bonusPercent: 0,
      merchantId: str("PLATEGA_MERCHANT_ID"),
      secret: str("PLATEGA_SECRET"),
      paymentMethod: Number(str("PLATEGA_METHOD", "0")) || 0,
      apiUrl: str("PLATEGA_API_URL", "https://app.platega.io"),
      path: str("PLATEGA_PATH", "/v2/transaction/process"),
      currency: str("PLATEGA_CURRENCY", "RUB"),
    },
    manual: { enabled: null, bonusPercent: 0 },
  };
}

function percent(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  // Верхняя граница чтобы опечатка в панели не раздала миллион VC.
  return Math.min(500, Math.max(0, Math.round(number * 100) / 100));
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Текущие настройки касс: значения из базы поверх значений из окружения. */
export async function getPaymentConfig(): Promise<PaymentConfig> {
  const base = defaults();
  let stored: Partial<PaymentConfig> | null = null;
  try {
    const setting = await db.setting.findUnique({ where: { key: KEY } });
    stored = (setting?.value ?? null) as Partial<PaymentConfig> | null;
  } catch {
    // База недоступна — отдаём настройки окружения, страница не падает.
    return base;
  }
  if (!stored) return base;

  const fk = (stored.freekassa ?? {}) as Partial<FreeKassaConfig>;
  const pl = (stored.platega ?? {}) as Partial<PlategaConfig>;
  const mn = (stored.manual ?? {}) as Partial<ManualConfig>;

  return {
    freekassa: {
      enabled: fk.enabled !== false,
      bonusPercent: percent(fk.bonusPercent, base.freekassa.bonusPercent),
      merchantId: text(fk.merchantId, base.freekassa.merchantId),
      secret1: text(fk.secret1, base.freekassa.secret1),
      secret2: text(fk.secret2, base.freekassa.secret2),
      payUrl: text(fk.payUrl, base.freekassa.payUrl),
      currency: text(fk.currency, base.freekassa.currency),
    },
    platega: {
      enabled: pl.enabled !== false,
      bonusPercent: percent(pl.bonusPercent, base.platega.bonusPercent),
      merchantId: text(pl.merchantId, base.platega.merchantId),
      secret: text(pl.secret, base.platega.secret),
      paymentMethod: Number.isFinite(Number(pl.paymentMethod))
        ? Number(pl.paymentMethod)
        : base.platega.paymentMethod,
      apiUrl: text(pl.apiUrl, base.platega.apiUrl),
      path: text(pl.path, base.platega.path),
      currency: text(pl.currency, base.platega.currency),
    },
    manual: {
      enabled: mn.enabled === true ? true : mn.enabled === false ? false : null,
      bonusPercent: percent(mn.bonusPercent, base.manual.bonusPercent),
    },
  };
}

/** Касса готова принимать деньги: включена и все ключи на месте. */
export function freekassaReady(config: PaymentConfig): boolean {
  const fk = config.freekassa;
  return Boolean(fk.enabled && fk.merchantId && fk.secret1 && fk.secret2);
}

export function plategaReady(config: PaymentConfig): boolean {
  const pl = config.platega;
  return Boolean(pl.enabled && pl.merchantId && pl.secret);
}

export type PublicProvider = {
  key: ProviderKey;
  title: string;
  hint: string;
  bonusPercent: number;
};

const TITLE: Record<ProviderKey, { title: string; hint: string }> = {
  freekassa: { title: "FreeKassa", hint: "Карты, СБП, кошельки, крипта" },
  platega: { title: "Платега", hint: "СБП, карты, крипта" },
  manual: { title: "Перевод вручную", hint: "Заявку проверяет администрация" },
};

/** Что показать игроку на странице пополнения. */
export function activeProviders(config: PaymentConfig): PublicProvider[] {
  const list: PublicProvider[] = [];
  if (freekassaReady(config)) {
    list.push({ key: "freekassa", ...TITLE.freekassa, bonusPercent: config.freekassa.bonusPercent });
  }
  if (plategaReady(config)) {
    list.push({ key: "platega", ...TITLE.platega, bonusPercent: config.platega.bonusPercent });
  }
  // Ручной приём остаётся запасным путём: без него, пока кассы не подключены,
  // пополнить было бы нечем.
  const manualOn = config.manual.enabled === null ? list.length === 0 : config.manual.enabled;
  if (manualOn) {
    list.push({ key: "manual", ...TITLE.manual, bonusPercent: config.manual.bonusPercent });
  }
  return list;
}

export function bonusPercentOf(config: PaymentConfig, provider: ProviderKey): number {
  if (provider === "freekassa") return config.freekassa.bonusPercent;
  if (provider === "platega") return config.platega.bonusPercent;
  return config.manual.bonusPercent;
}

/** Сколько VC получит игрок: курс плюс бонус выбранной кассы. */
export function vcForRub(amountRub: number, bonusPercent: number): { vc: number; bonus: number } {
  const base = Math.floor(amountRub * CONFIG.vcPerRub);
  const bonus = Math.floor((base * bonusPercent) / 100);
  return { vc: base + bonus, bonus };
}

type SecretPatch = string | null | undefined;

export type ProviderPatch = {
  enabled?: boolean | null;
  bonusPercent?: number;
  merchantId?: SecretPatch;
  secret1?: SecretPatch;
  secret2?: SecretPatch;
  secret?: SecretPatch;
  payUrl?: SecretPatch;
  apiUrl?: SecretPatch;
  currency?: SecretPatch;
  paymentMethod?: number;
};

/** Пустая строка означает «не трогать», null — очистить ключ. */
function patchSecret(current: string, next: SecretPatch): string {
  if (next === null) return "";
  if (typeof next !== "string") return current;
  return next.trim() ? next.trim() : current;
}

export async function savePaymentConfig(params: {
  provider: ProviderKey;
  patch: ProviderPatch;
  adminId: string;
}): Promise<PaymentConfig> {
  const config = await getPaymentConfig();
  const { provider, patch } = params;

  if (provider === "freekassa") {
    const fk = config.freekassa;
    config.freekassa = {
      ...fk,
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : fk.enabled,
      bonusPercent: patch.bonusPercent === undefined ? fk.bonusPercent : percent(patch.bonusPercent, fk.bonusPercent),
      merchantId: patchSecret(fk.merchantId, patch.merchantId),
      secret1: patchSecret(fk.secret1, patch.secret1),
      secret2: patchSecret(fk.secret2, patch.secret2),
      payUrl: patchSecret(fk.payUrl, patch.payUrl) || "https://pay.fk.money/",
      currency: patchSecret(fk.currency, patch.currency) || "RUB",
    };
  } else if (provider === "platega") {
    const pl = config.platega;
    config.platega = {
      ...pl,
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : pl.enabled,
      bonusPercent: patch.bonusPercent === undefined ? pl.bonusPercent : percent(patch.bonusPercent, pl.bonusPercent),
      merchantId: patchSecret(pl.merchantId, patch.merchantId),
      secret: patchSecret(pl.secret, patch.secret),
      paymentMethod:
        patch.paymentMethod === undefined || !Number.isFinite(Number(patch.paymentMethod))
          ? pl.paymentMethod
          : Number(patch.paymentMethod),
      apiUrl: patchSecret(pl.apiUrl, patch.apiUrl) || "https://app.platega.io",
      currency: patchSecret(pl.currency, patch.currency) || "RUB",
    };
  } else {
    const mn = config.manual;
    config.manual = {
      enabled: patch.enabled === undefined ? mn.enabled : patch.enabled,
      bonusPercent: patch.bonusPercent === undefined ? mn.bonusPercent : percent(patch.bonusPercent, mn.bonusPercent),
    };
  }

  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: config, updatedById: params.adminId },
    update: { value: config, updatedById: params.adminId },
  });
  // В журнал пишем без ключей: он доступен администраторам от третьего уровня.
  await audit({
    actorId: params.adminId,
    action: "admin.payments.configure",
    meta: {
      provider,
      enabled: config[provider].enabled,
      bonusPercent: bonusPercentOf(config, provider),
      secretsChanged: Object.keys(patch).filter((field) =>
        ["merchantId", "secret", "secret1", "secret2"].includes(field),
      ),
    },
  });

  return config;
}

/** Скрытый вид ключа для панели: подтверждает, что он сохранён. */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

/**
 * Начисление по оплаченному счёту. Общая часть для всех касс: статус меняем
 * условно, поэтому повторное уведомление денег не добавит.
 */
export async function creditPayment(params: {
  paymentId: string;
  providerId: string | null;
  note: string;
}): Promise<{ credited: boolean }> {
  const payment = await db.payment.findUnique({ where: { id: params.paymentId } });
  if (!payment) return { credited: false };

  const claimed = await db.payment.updateMany({
    where: { id: payment.id, status: "pending" },
    data: {
      status: "paid",
      paidAt: new Date(),
      providerId: params.providerId,
      reviewNote: params.note,
    },
  });
  if (claimed.count === 0) return { credited: false };

  const balance = await applyTransaction({
    userId: payment.userId,
    type: "TOPUP",
    amount: payment.vcAmount,
    meta: {
      paymentId: payment.id,
      amountRub: payment.amountRub,
      bonusVc: payment.bonusVc,
      provider: payment.provider,
      providerId: params.providerId,
    },
  });
  const share = await payPartnerShare({
    userId: payment.userId,
    creditedVc: payment.vcAmount,
    paymentId: payment.id,
  });

  await audit({
    actorId: null,
    action: `payment.${payment.provider}.paid`,
    targetUserId: payment.userId,
    meta: {
      paymentId: payment.id,
      amountRub: payment.amountRub,
      vcAmount: payment.vcAmount,
      bonusVc: payment.bonusVc,
      balance,
      partnerShare: share,
      providerId: params.providerId,
    },
  });

  return { credited: true };
}
