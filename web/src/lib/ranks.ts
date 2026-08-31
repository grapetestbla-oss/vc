import { db } from "./db";
import { audit } from "./audit";
import { ADMIN_LEVELS } from "./config";

/**
 * Ранги администрации. Уровень — по-прежнему число: по нему плагин решает, кому
 * что можно в игре, и по нему же сравнивается старшинство. А название, метка в
 * чате и набор прав живут в базе и правятся в панели.
 */

export type Permission = {
  key: string;
  title: string;
  group: string;
  /// С какого уровня право выдавалось раньше — им же заполняются новые ранги.
  defaultLevel: number;
};

/** Всё, что вообще умеет панель. Ключи совпадают с проверками в коде. */
export const PERMISSIONS: Permission[] = [
  { key: "panel.view", title: "Вход в панель", group: "Панель", defaultLevel: 3 },
  { key: "users.view", title: "Карточки игроков", group: "Игроки", defaultLevel: 3 },
  { key: "users.inventory", title: "Инвентарь в игре", group: "Игроки", defaultLevel: 3 },
  { key: "users.balance", title: "Правка баланса", group: "Игроки", defaultLevel: 5 },
  { key: "users.password", title: "Выдача нового пароля", group: "Игроки", defaultLevel: 5 },
  { key: "users.wipe", title: "Обнуление аккаунта", group: "Игроки", defaultLevel: 5 },
  { key: "users.staff", title: "Выдача админки", group: "Игроки", defaultLevel: 5 },
  { key: "punish.issue", title: "Выдача наказаний", group: "Наказания", defaultLevel: 3 },
  { key: "punish.lift", title: "Снятие наказаний", group: "Наказания", defaultLevel: 3 },
  { key: "appeals.review", title: "Заявления о разбане", group: "Наказания", defaultLevel: 5 },
  { key: "logs.view", title: "Журнал действий", group: "Наблюдение", defaultLevel: 3 },
  { key: "flags.view", title: "Срабатывания антифрода", group: "Наблюдение", defaultLevel: 3 },
  { key: "security.view", title: "Безопасность", group: "Наблюдение", defaultLevel: 3 },
  { key: "promos.view", title: "Промо и бонусы", group: "Экономика", defaultLevel: 3 },
  { key: "promos.manage", title: "Создание промо и бонусов", group: "Экономика", defaultLevel: 5 },
  { key: "partners.review", title: "Заявки партнёров", group: "Экономика", defaultLevel: 3 },
  { key: "payments.review", title: "Заявки на пополнение", group: "Экономика", defaultLevel: 5 },
  { key: "payments.providers", title: "Настройка касс", group: "Экономика", defaultLevel: 5 },
  { key: "shop.manage", title: "Каталог магазина", group: "Экономика", defaultLevel: 5 },
  { key: "news.manage", title: "Новости", group: "Контент", defaultLevel: 5 },
  { key: "giveaways.manage", title: "Розыгрыши", group: "Контент", defaultLevel: 5 },
  { key: "tickets.answer", title: "Обращения в поддержку", group: "Контент", defaultLevel: 5 },
  { key: "server.control", title: "Управление сервером", group: "Сервер", defaultLevel: 5 },
  { key: "games.toggle", title: "Включение мини-игр", group: "Сервер", defaultLevel: 5 },
  { key: "maintenance.toggle", title: "Технические работы", group: "Сервер", defaultLevel: 5 },
  { key: "ranks.manage", title: "Ранги и права", group: "Сервер", defaultLevel: 5 },
];

export const PERMISSION_KEYS = new Set(PERMISSIONS.map((permission) => permission.key));

export type Rank = {
  level: number;
  key: string;
  title: string;
  prefix: string | null;
  color: string | null;
  permissions: string[];
  builtin: boolean;
};

/** Права по умолчанию: ровно те, что действовали до появления рангов. */
export function defaultPermissions(level: number): string[] {
  return PERMISSIONS.filter((permission) => level >= permission.defaultLevel).map(
    (permission) => permission.key,
  );
}

function fallbackRank(level: number): Rank {
  const base = ADMIN_LEVELS[level];
  return {
    level,
    key: base?.key ?? `level${level}`,
    title: base?.title ?? `Уровень ${level}`,
    prefix: base?.prefix ?? null,
    color: null,
    permissions: defaultPermissions(level),
    builtin: Boolean(base),
  };
}

/** Все ранги: строки из базы поверх встроенных уровней 1–5. */
export async function listRanks(): Promise<Rank[]> {
  let rows: Awaited<ReturnType<typeof db.adminRank.findMany>> = [];
  try {
    rows = await db.adminRank.findMany({ orderBy: { level: "asc" } });
  } catch {
    // База недоступна или таблицы ещё нет — работаем на встроенных уровнях.
    return Object.keys(ADMIN_LEVELS).map((level) => fallbackRank(Number(level)));
  }

  const byLevel = new Map<number, Rank>();
  for (const level of Object.keys(ADMIN_LEVELS)) {
    byLevel.set(Number(level), fallbackRank(Number(level)));
  }
  for (const row of rows) {
    byLevel.set(row.level, {
      level: row.level,
      key: row.key,
      title: row.title,
      prefix: row.prefix,
      color: row.color,
      // Пустой список прав означает «как по умолчанию для уровня»: так новый
      // ранг не оказывается бесправным из-за забытой галочки.
      permissions: row.permissions.length ? row.permissions : defaultPermissions(row.level),
      builtin: row.builtin,
    });
  }

  return [...byLevel.values()].sort((left, right) => left.level - right.level);
}

export async function rankOf(level: number): Promise<Rank> {
  if (level <= 0) return { ...fallbackRank(0), title: "Игрок", permissions: [] };
  const ranks = await listRanks();
  return ranks.find((rank) => rank.level === level) ?? fallbackRank(level);
}

/** Есть ли у уровня такое право. */
export async function levelHas(level: number, permission: string): Promise<boolean> {
  if (level <= 0) return false;
  const rank = await rankOf(level);
  return rank.permissions.includes(permission);
}

export class RankError extends Error {}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function clean(input: {
  title?: string;
  prefix?: string | null;
  color?: string | null;
  permissions?: string[];
}) {
  const title = (input.title ?? "").trim().slice(0, 40);
  const prefix = (input.prefix ?? "").trim().slice(0, 24) || null;
  const color = (input.color ?? "").trim().slice(0, 9) || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new RankError("Цвет — HEX вида #f5c451");

  const permissions = (input.permissions ?? []).filter((key) => PERMISSION_KEYS.has(key));
  return { title, prefix, color, permissions };
}

export async function createRank(
  input: { level: number; title: string; prefix?: string; color?: string; permissions?: string[] },
  adminId: string,
): Promise<Rank> {
  const level = Math.floor(Number(input.level));
  if (!Number.isFinite(level) || level < 1 || level > 20) {
    throw new RankError("Уровень — число от 1 до 20");
  }
  const { title, prefix, color, permissions } = clean(input);
  if (!title) throw new RankError("Название обязательно");

  const existing = await db.adminRank.findUnique({ where: { level } });
  if (existing || ADMIN_LEVELS[level]) throw new RankError(`Уровень ${level} уже занят`);

  const key = slug(title) || `level${level}`;
  const row = await db.adminRank.create({
    data: { level, key, title, prefix, color, permissions, builtin: false },
  });
  await audit({
    actorId: adminId,
    action: "admin.rank.create",
    meta: { level, title, permissions: permissions.length },
  });
  return { ...row, permissions: row.permissions.length ? row.permissions : defaultPermissions(level) };
}

export async function updateRank(
  input: { level: number; title?: string; prefix?: string; color?: string; permissions?: string[] },
  adminId: string,
): Promise<Rank> {
  const level = Math.floor(Number(input.level));
  const current = await rankOf(level);
  const { title, prefix, color, permissions } = clean({
    title: input.title ?? current.title,
    prefix: input.prefix ?? current.prefix,
    color: input.color ?? current.color,
    permissions: input.permissions ?? current.permissions,
  });
  if (!title) throw new RankError("Название обязательно");

  // Право на правку рангов у чиф-администратора не отнимается: иначе панель
  // запирается снаружи и вернуть доступ можно будет только через базу.
  if (level >= 5 && !permissions.includes("ranks.manage")) permissions.push("ranks.manage");
  if (level >= 5 && !permissions.includes("panel.view")) permissions.push("panel.view");

  const row = await db.adminRank.upsert({
    where: { level },
    create: {
      level,
      key: current.key,
      title,
      prefix,
      color,
      permissions,
      builtin: current.builtin,
    },
    update: { title, prefix, color, permissions },
  });
  await audit({
    actorId: adminId,
    action: "admin.rank.update",
    meta: { level, title, permissions: permissions.length },
  });
  return { ...row, permissions: row.permissions.length ? row.permissions : defaultPermissions(level) };
}

export async function deleteRank(level: number, adminId: string) {
  if (ADMIN_LEVELS[level]) throw new RankError("Встроенный ранг удалить нельзя — его можно переименовать");

  const holders = await db.user.count({ where: { adminLevel: level } });
  if (holders > 0) {
    throw new RankError(`Ранг занят: ${holders} аккаунт(ов). Сначала переведите их на другой уровень`);
  }

  await db.adminRank.delete({ where: { level } });
  await audit({ actorId: adminId, action: "admin.rank.delete", meta: { level } });
}
