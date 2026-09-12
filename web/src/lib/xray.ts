import { db } from "./db";
import { flag } from "./antifraud";
import { escapeHtml, send } from "./telegram";

/**
 * Ловушечная руда против X-Ray.
 *
 * Плагин прячет в камне руду, к которой нет ни одного открытого подхода: её не
 * видно ни с поверхности, ни из пещеры, и наткнуться на неё обычной шахтой
 * почти невозможно. Тот, кто прокопался ровно к ней, видел её сквозь камень.
 *
 * «Почти» здесь важно: случайный штрек всё-таки может пройти через ловушку,
 * поэтому сработка — это повод посмотреть запись и поговорить, а не готовый
 * приговор. Автонаказаний тут нет намеренно.
 */

export type XrayReport = {
  login: string;
  /** Что за блок оказался ловушкой. */
  ore: string;
  world: string;
  x: number;
  y: number;
  z: number;
  /** Сколько ловушек этот игрок выкопал за сессию — по одной ещё не судят. */
  hits: number;
  /** Сколько блоков он сломал рядом до этого: прямой тоннель заметно короче. */
  brokenNearby: number;
};

/** Кому уходят оповещения: отдельный чат, а если его нет — админам в личку. */
async function notifyAdmins(text: string) {
  const room = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (room) {
    await send(room, text);
    return;
  }

  const admins = await db.telegramAccount.findMany({
    where: { user: { adminLevel: { gte: 3 } } },
    select: { telegramId: true },
  });
  for (const admin of admins) {
    await send(admin.telegramId, text);
  }
}

export async function reportXray(report: XrayReport) {
  const user = await db.user.findUnique({
    where: { login: report.login },
    select: { id: true, login: true },
  });
  if (!user) return null;

  // Чем больше ловушек подряд, тем меньше похоже на совпадение.
  const severity = report.hits >= 3 ? 3 : report.hits === 2 ? 2 : 1;

  await flag(user.id, "XRAY_TRAP", severity, {
    ore: report.ore,
    world: report.world,
    x: report.x,
    y: report.y,
    z: report.z,
    hits: report.hits,
    brokenNearby: report.brokenNearby,
  });

  const site = process.env.SITE_URL ?? "https://vanillacraft.click";
  await notifyAdmins(
    `⛏ <b>Ловушечная руда</b>\n` +
      `Игрок: <b>${escapeHtml(user.login)}</b>\n` +
      `Блок: ${escapeHtml(report.ore)} в ${escapeHtml(report.world)} на ${report.x}, ${report.y}, ${report.z}\n` +
      `Ловушек за сессию: ${report.hits}, блоков сломано рядом: ${report.brokenNearby}\n` +
      `${site}/panel/flags`,
  );

  return { severity };
}
