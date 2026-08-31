import { randomBytes } from "node:crypto";
import { db } from "./db";
import { levelHas } from "./ranks";

/**
 * Telegram-бот сервера.
 *
 * Токен живёт только в переменных окружения: в репозитории его нет и быть не
 * должно — по нему кто угодно управляет ботом. Вебхук закрыт секретом, который
 * Telegram присылает заголовком, иначе на наш адрес мог бы писать любой.
 */

const API = "https://api.telegram.org";

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || "VanillaCraftx_bot";
}

/** Секрет вебхука. Пока не задан, обработчик не принимает ничего. */
export function webhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const token = botToken();
  if (!token) return false;

  const response = await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  }).catch(() => null);

  return response?.ok === true;
}

/** Ссылка, по которой игрок открывает бота с уже вписанным кодом. */
export function linkUrl(code: string): string {
  return `https://t.me/${botUsername()}?start=${code}`;
}

/** Код без похожих символов: его диктуют в игре и переписывают руками. */
function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export const LINK_CODE_MINUTES = 15;

/**
 * Выдаёт код привязки. Прежние коды игрока гасим: иначе украденный из чата
 * старый код работал бы наравне со свежим.
 */
export async function issueLinkCode(userId: string) {
  await db.telegramLinkCode.deleteMany({ where: { userId, usedAt: null } });
  return db.telegramLinkCode.create({
    data: {
      code: newCode(),
      userId,
      expiresAt: new Date(Date.now() + LINK_CODE_MINUTES * 60_000),
    },
  });
}

export type LinkResult =
  | { ok: true; login: string }
  | { ok: false; error: "unknown" | "expired" | "taken" | "already" };

/** Привязка по коду. Один Telegram — один аккаунт, и наоборот. */
export async function linkByCode(
  code: string,
  telegram: { id: string; username?: string; firstName?: string },
): Promise<LinkResult> {
  const entry = await db.telegramLinkCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { user: { select: { id: true, login: true } } },
  });
  if (!entry || entry.usedAt) return { ok: false, error: "unknown" };
  if (entry.expiresAt < new Date()) return { ok: false, error: "expired" };

  const occupied = await db.telegramAccount.findUnique({ where: { telegramId: telegram.id } });
  if (occupied && occupied.userId !== entry.userId) return { ok: false, error: "taken" };

  const existing = await db.telegramAccount.findUnique({ where: { userId: entry.userId } });
  if (existing && existing.telegramId !== telegram.id) return { ok: false, error: "already" };

  const fields = {
    telegramId: telegram.id,
    username: telegram.username ?? null,
    firstName: telegram.firstName ?? null,
  };
  await db.telegramAccount.upsert({
    where: { userId: entry.userId },
    create: { userId: entry.userId, ...fields },
    update: fields,
  });
  await db.telegramLinkCode.update({ where: { code: entry.code }, data: { usedAt: new Date() } });

  return { ok: true, login: entry.user.login };
}

/** Аккаунт сайта по Telegram id — с ним бот и работает. */
export async function accountOf(telegramId: string) {
  const link = await db.telegramAccount.findUnique({
    where: { telegramId },
    include: { user: true },
  });
  return link?.user ?? null;
}

/**
 * Право на командование ботом берём из рангов сайта, а не из списка id.
 * Так админку не приходится держать в двух местах, и снятие прав в панели
 * закрывает доступ и в боте.
 */
export async function mayManageGiveaways(userId: string | null, adminLevel: number) {
  if (!userId) return false;
  return levelHas(adminLevel, "giveaways.manage");
}
