import { db } from "./db";

/**
 * Скины из личного кабинета.
 *
 * Сервер в offline-mode, поэтому Mojang скины не выдаёт — их раздаёт
 * SkinsRestorer. Картинку он умеет брать по ссылке, значит нам достаточно
 * хранить файл у себя и отдавать его публично, а в игру передать адрес.
 */

/** 100 КБ с запасом: настоящий скин 64×64 весит единицы килобайт. */
export const MAX_SKIN_BYTES = 100 * 1024;
export const SKIN_VARIANTS = ["classic", "slim"] as const;
export type SkinVariant = (typeof SKIN_VARIANTS)[number];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Только форматы Minecraft: новый 64×64 и старый 64×32. */
const SIZES = [
  [64, 64],
  [64, 32],
];

export type SkinCheck = { ok: true; width: number; height: number } | { ok: false; error: string };

/**
 * Проверяем PNG сами: подпись, размеры из IHDR и вес. Читать заголовок руками
 * дешевле, чем тащить графическую библиотеку ради двенадцати байт.
 */
export function checkSkinPng(bytes: Buffer): SkinCheck {
  if (bytes.length > MAX_SKIN_BYTES) return { ok: false, error: "Файл больше 100 КБ" };
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { ok: false, error: "Нужен PNG" };
  }
  // Первый чанк PNG всегда IHDR: 8 байт подписи, 4 длины, 4 типа, дальше размеры.
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") return { ok: false, error: "Битый PNG" };

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!SIZES.some(([w, h]) => w === width && h === height)) {
    return { ok: false, error: `Скин должен быть 64×64 или 64×32, а не ${width}×${height}` };
  }
  return { ok: true, width, height };
}

/** Ник, чей скин копируем: правила Minecraft, без пробелов и точек. */
export function validNick(nick: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(nick);
}

export function isVariant(value: unknown): value is SkinVariant {
  return typeof value === "string" && SKIN_VARIANTS.includes(value as SkinVariant);
}

/**
 * Поручение серверу. Своя картинка приезжает ссылкой: SkinsRestorer сохраняет
 * её как именной скин и надевает. Имя со временем правки — чтобы плагин не
 * достал из своего кэша прошлую картинку под тем же именем.
 */
export async function queueSkinAction(
  userId: string,
  login: string,
  payload: Record<string, unknown>,
) {
  await db.serverAction.deleteMany({ where: { userId, kind: "APPLY_SKIN", deliveredAt: null } });
  await db.serverAction.create({
    data: { kind: "APPLY_SKIN", login, userId, payload: payload as never },
  });
}

export function skinPayload(
  skin: { kind: string; nick: string | null; variant: string; updatedAt: Date },
  origin: string,
  login: string,
) {
  if (skin.kind === "NICK") return { mode: "nick", nick: skin.nick, variant: skin.variant };
  return {
    mode: "url",
    url: `${origin}/api/skins/${encodeURIComponent(login)}.png`,
    name: `vc_${login}_${Math.floor(skin.updatedAt.getTime() / 1000)}`.toLowerCase(),
    variant: skin.variant,
  };
}
