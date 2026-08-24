/** Настройки экономики и игр. Меняются через переменные окружения. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CONFIG = {
  /** Возврат игроку в мини-играх. 0.95 = 5% преимущества заведения. */
  rtp: num("GAME_RTP", 0.95),
  minBet: num("GAME_MIN_BET", 10),
  rouletteMultipliers: [2, 3, 5, 10] as const,
  /** Курс пополнения: сколько VC даёт один рубль. 1 ₽ = 2 VC. */
  vcPerRub: num("VC_PER_RUB", 2),
  /** Границы заявки на пополнение, рубли. */
  minTopUpRub: num("TOPUP_MIN_RUB", 50),
  maxTopUpRub: num("TOPUP_MAX_RUB", 100_000),
  promoReward: num("PROMO_REWARD_VC", 1000),
  /** Доля медиапартнёра от пополнений его рефералов, проценты. */
  partnerSharePercent: num("PARTNER_SHARE_PERCENT", 10),
  promoRequiredLevel: num("PROMO_REQUIRED_LEVEL", 3),
  dailyBonusVc: num("DAILY_BONUS_VC", 25),
} as const;

export const ADMIN_LEVELS: Record<number, { key: string; title: string; prefix: string | null }> = {
  1: { key: "media", title: "Media", prefix: null },
  2: { key: "helper", title: "Helper", prefix: "HELPER" },
  3: { key: "administrator", title: "Administrator", prefix: "ADMIN" },
  4: { key: "pr", title: "PR Assistant", prefix: "PR" },
  5: { key: "chief", title: "Chief Administrator", prefix: "Chief Admin" },
};
