import { db } from "./db";
import { accountOf, linkByCode, mayManageGiveaways } from "./telegram";
import {
  cancelGiveaway,
  createGiveaway,
  drawGiveaway,
  GiveawayError,
  hoursOf,
} from "./giveaways";

/**
 * Разбор команд бота. Держим отдельно от вебхука: так логику можно прогнать
 * тестами, не изображая запросы Telegram.
 */

export type Sender = { id: string; username?: string; firstName?: string };

const HELP_PLAYER = [
  "<b>VanillaCraft</b>",
  "",
  "/link <code>КОД</code> — привязать аккаунт (код берётся в игре командой /tg или в личном кабинете)",
  "/me — что бот знает о вас",
  "/unlink — отвязать аккаунт",
].join("\n");

const HELP_ADMIN = [
  "",
  "",
  "<b>Розыгрыши</b>",
  "/newgiveaway <code>часы | название | приз | описание</code>",
  "/giveaways — активные розыгрыши и их номера",
  "/draw <code>номер</code> — определить победителя",
  "/cancel <code>номер</code> — отменить",
].join("\n");

/** Короткий номер розыгрыша: cuid диктовать в чат невозможно. */
function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

async function giveawayByShortId(short: string) {
  const key = short.trim().toUpperCase();
  const active = await db.giveaway.findMany({
    where: { status: "active" },
    orderBy: { startsAt: "desc" },
    take: 50,
  });
  return active.find((giveaway) => shortId(giveaway.id) === key) ?? null;
}

export async function handleCommand(sender: Sender, text: string): Promise<string> {
  const trimmed = text.trim();
  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.toLowerCase().replace(/@.*$/, "");
  const argument = rest.join(" ").trim();

  const user = await accountOf(sender.id);

  switch (command) {
    case "/start":
      // Кнопка «Запустить» приносит код прямо в аргументе ссылки.
      if (argument) return link(sender, argument);
      return user
        ? `Аккаунт уже привязан: <b>${user.login}</b>.\n\n${await help(user)}`
        : `Привет! Чтобы привязать аккаунт, зайдите в игру и введите <code>/tg</code> — бот подскажет код.\n\n${HELP_PLAYER}`;

    case "/link":
      if (!argument) return "Укажите код: <code>/link КОД</code>";
      return link(sender, argument);

    case "/me":
      if (!user) return "Аккаунт не привязан. Введите в игре <code>/tg</code> и пришлите код.";
      return [
        `Аккаунт: <b>${user.login}</b>`,
        `Часов наиграно: <b>${hoursOf(user.playtimeSec)}</b>`,
        `Баланс: <b>${user.balanceVc} VC</b>`,
      ].join("\n");

    case "/unlink":
      if (!user) return "Привязки и так нет.";
      await db.telegramAccount.deleteMany({ where: { userId: user.id } });
      return "Аккаунт отвязан.";

    case "/newgiveaway":
      return withAdmin(user, () => newGiveaway(user!.id, argument));

    case "/giveaways":
      return withAdmin(user, listGiveaways);

    case "/draw":
      return withAdmin(user, () => draw(user!.id, argument));

    case "/cancel":
      return withAdmin(user, () => cancel(user!.id, argument));

    case "/help":
      return help(user);

    default:
      return help(user);
  }
}

type SiteUser = { id: string; login: string; adminLevel: number; playtimeSec: number; balanceVc: number };

async function help(user: SiteUser | null): Promise<string> {
  const admin = user && (await mayManageGiveaways(user.id, user.adminLevel));
  return HELP_PLAYER + (admin ? HELP_ADMIN : "");
}

async function withAdmin(
  user: SiteUser | null,
  action: () => Promise<string>,
): Promise<string> {
  if (!user) return "Сначала привяжите аккаунт: в игре <code>/tg</code>.";
  if (!(await mayManageGiveaways(user.id, user.adminLevel))) {
    return "Эта команда только для администрации.";
  }
  return action();
}

async function link(sender: Sender, code: string): Promise<string> {
  const result = await linkByCode(code, sender);
  if (result.ok) return `Готово. Аккаунт <b>${result.login}</b> привязан.`;

  switch (result.error) {
    case "expired":
      return "Код просрочен. Возьмите новый: в игре <code>/tg</code>.";
    case "taken":
      return "Этот Telegram уже привязан к другому аккаунту.";
    case "already":
      return "К аккаунту уже привязан другой Telegram. Сначала /unlink в нём.";
    default:
      return "Код не подошёл. Проверьте, что скопировали его целиком.";
  }
}

async function newGiveaway(adminId: string, argument: string): Promise<string> {
  const parts = argument.split("|").map((part) => part.trim());
  if (parts.length < 3) {
    return [
      "Формат: <code>/newgiveaway часы | название | приз | описание</code>",
      "Описание можно не писать.",
      "",
      "Пример: <code>/newgiveaway 15 | Розыгрыш к выходным | 5000 VC | Итоги в воскресенье</code>",
    ].join("\n");
  }

  const hours = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(hours)) return "Часы должны быть числом.";

  try {
    const giveaway = await createGiveaway({
      adminId,
      title: parts[1],
      prize: parts[2],
      description: parts[3] ?? "",
      requiredHours: hours,
      endsAt: null,
    });
    return [
      `Розыгрыш создан: <b>${giveaway.title}</b>`,
      `Приз: ${giveaway.prize}`,
      `Условие: ${giveaway.requiredHours} ч наигранных`,
      `Номер для розыгрыша: <code>${shortId(giveaway.id)}</code>`,
    ].join("\n");
  } catch (error) {
    if (error instanceof GiveawayError) return `Не вышло: ${error.message}`;
    throw error;
  }
}

async function listGiveaways(): Promise<string> {
  const active = await db.giveaway.findMany({
    where: { status: "active" },
    orderBy: { startsAt: "desc" },
    take: 20,
    include: { _count: { select: { entries: true } } },
  });
  if (active.length === 0) return "Активных розыгрышей нет.";

  return active
    .map((giveaway) =>
      [
        `<code>${shortId(giveaway.id)}</code> — <b>${giveaway.title}</b>`,
        `приз: ${giveaway.prize} · от ${giveaway.requiredHours} ч · участников: ${giveaway._count.entries}`,
      ].join("\n"),
    )
    .join("\n\n");
}

async function draw(adminId: string, argument: string): Promise<string> {
  if (!argument) return "Укажите номер: <code>/draw НОМЕР</code>";
  const giveaway = await giveawayByShortId(argument);
  if (!giveaway) return "Розыгрыш с таким номером не найден среди активных.";

  try {
    const finished = await drawGiveaway({ giveawayId: giveaway.id, adminId });
    return [
      `<b>${finished.title}</b> разыгран.`,
      `Победитель: <b>${finished.winner?.login ?? "—"}</b>`,
      `Участников по условию: ${finished.drawnFrom ?? 0}`,
      `Сид: <code>${finished.drawSeed}</code>`,
    ].join("\n");
  } catch (error) {
    if (error instanceof GiveawayError) return `Не вышло: ${error.message}`;
    throw error;
  }
}

async function cancel(adminId: string, argument: string): Promise<string> {
  if (!argument) return "Укажите номер: <code>/cancel НОМЕР</code>";
  const giveaway = await giveawayByShortId(argument);
  if (!giveaway) return "Розыгрыш с таким номером не найден среди активных.";

  try {
    await cancelGiveaway({ giveawayId: giveaway.id, adminId });
    return `Розыгрыш «${giveaway.title}» отменён.`;
  } catch (error) {
    if (error instanceof GiveawayError) return `Не вышло: ${error.message}`;
    throw error;
  }
}
