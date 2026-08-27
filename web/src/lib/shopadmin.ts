import { db } from "./db";
import { audit } from "./audit";
import { ShopError } from "./shop";
import type { Prisma } from "@prisma/client";

/**
 * Правка каталога магазина из панели. Каталог из `prisma/shop.mjs` — только
 * первое наполнение: дальше товары живут в базе и меняются здесь.
 */

/** Возможности, которые понимает плагин. Новую сначала учат плагин. */
export const SHOP_FEATURES = ["tp", "back", "home", "enderchest", "craft", "keepinv"] as const;

export const SHOP_KINDS = ["CHARGES", "PERMANENT"] as const;

export type ShopItemInput = {
  key?: string;
  title?: string;
  description?: string;
  category?: string;
  priceVc?: number;
  kind?: string;
  charges?: number;
  feature?: string;
  payload?: unknown;
  requiredLevel?: number;
  sort?: number;
  active?: boolean;
};

const KEY_RE = /^[a-z0-9_]{2,32}$/;

function text(value: unknown, field: string, max: number): string {
  const line = typeof value === "string" ? value.trim() : "";
  if (!line) throw new ShopError(`Заполните поле «${field}»`);
  if (line.length > max) throw new ShopError(`«${field}» длиннее ${max} символов`);
  return line;
}

function whole(value: unknown, field: string, min: number, max: number): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ShopError(`«${field}»: нужно число от ${min} до ${max}`);
  }
  return number;
}

/**
 * Плагин ищет товар по `payload.feature`, поэтому возможность обязательна.
 * Остальные поля payload (например, кулдаун) можно дописать своим JSON.
 */
function buildPayload(input: ShopItemInput): Prisma.InputJsonValue {
  let extra: Record<string, unknown> = {};
  if (typeof input.payload === "string" && input.payload.trim()) {
    try {
      const parsed = JSON.parse(input.payload) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
      extra = parsed as Record<string, unknown>;
    } catch {
      throw new ShopError("Настройки товара — не JSON-объект");
    }
  } else if (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)) {
    extra = input.payload as Record<string, unknown>;
  }

  const feature = text(input.feature ?? extra.feature, "возможность", 40);
  return { ...extra, feature } as Prisma.InputJsonValue;
}

export async function createShopItem(input: ShopItemInput, adminId: string) {
  const key = (input.key ?? "").trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    throw new ShopError("Ключ: латиница, цифры и подчёркивание, от 2 до 32 символов");
  }
  const exists = await db.shopItem.findUnique({ where: { key } });
  if (exists) throw new ShopError("Товар с таким ключом уже есть");

  const kind = input.kind === "PERMANENT" ? "PERMANENT" : "CHARGES";
  const charges = kind === "PERMANENT" ? 0 : whole(input.charges ?? 1, "использований", 1, 10_000);

  const item = await db.shopItem.create({
    data: {
      key,
      title: text(input.title, "название", 60),
      description: text(input.description, "описание", 400),
      category: text(input.category, "раздел", 40),
      priceVc: whole(input.priceVc, "цена", 0, 10_000_000),
      kind,
      charges,
      payload: buildPayload(input),
      requiredLevel: whole(input.requiredLevel ?? 0, "уровень", 0, 10),
      sort: whole(input.sort ?? 100, "порядок", 0, 100_000),
      active: input.active !== false,
    },
  });

  await audit({
    actorId: adminId,
    action: "admin.shop.create",
    meta: { key: item.key, title: item.title, priceVc: item.priceVc },
  });
  return item;
}

export async function updateShopItem(input: ShopItemInput, adminId: string) {
  const key = (input.key ?? "").trim();
  const current = await db.shopItem.findUnique({ where: { key } });
  if (!current) throw new ShopError("Товар не найден");

  const data: Prisma.ShopItemUpdateInput = {};
  if (input.title !== undefined) data.title = text(input.title, "название", 60);
  if (input.description !== undefined) {
    data.description = text(input.description, "описание", 400);
  }
  if (input.category !== undefined) data.category = text(input.category, "раздел", 40);
  if (input.priceVc !== undefined) data.priceVc = whole(input.priceVc, "цена", 0, 10_000_000);
  if (input.requiredLevel !== undefined) {
    data.requiredLevel = whole(input.requiredLevel, "уровень", 0, 10);
  }
  if (input.sort !== undefined) data.sort = whole(input.sort, "порядок", 0, 100_000);
  if (typeof input.active === "boolean") data.active = input.active;

  const kind = input.kind === undefined ? current.kind : input.kind === "PERMANENT" ? "PERMANENT" : "CHARGES";
  if (input.kind !== undefined) data.kind = kind;
  if (input.charges !== undefined || input.kind !== undefined) {
    data.charges =
      kind === "PERMANENT" ? 0 : whole(input.charges ?? current.charges ?? 1, "использований", 1, 10_000);
  }
  if (input.feature !== undefined || input.payload !== undefined) {
    const source = (current.payload ?? {}) as Record<string, unknown>;
    data.payload = buildPayload({
      feature: input.feature ?? (source.feature as string | undefined),
      payload: input.payload ?? source,
    });
  }

  const item = await db.shopItem.update({ where: { key }, data });
  await audit({
    actorId: adminId,
    action: "admin.shop.update",
    meta: { key, changed: Object.keys(data) },
  });
  return item;
}

/**
 * Удаляем только то, что никто не купил: покупки завязаны на товар каскадом,
 * и удаление вместе с ними отняло бы у игроков оплаченное. Купленное — гасим.
 */
export async function deleteShopItem(key: string, adminId: string) {
  const item = await db.shopItem.findUnique({
    where: { key },
    include: { _count: { select: { purchases: true } } },
  });
  if (!item) throw new ShopError("Товар не найден");
  if (item._count.purchases > 0) {
    throw new ShopError(
      `Товар уже куплен ${item._count.purchases} раз — его можно только выключить, чтобы не отнимать оплаченное`,
    );
  }

  await db.shopItem.delete({ where: { key } });
  await audit({ actorId: adminId, action: "admin.shop.delete", meta: { key, title: item.title } });
  return item;
}

/** Каталог для панели: с числом покупок и выручкой по каждому товару. */
export async function shopCatalogue() {
  const [items, revenue] = await Promise.all([
    db.shopItem.findMany({
      orderBy: [{ sort: "asc" }, { priceVc: "asc" }],
      include: { _count: { select: { purchases: true } } },
    }),
    db.shopPurchase.groupBy({ by: ["itemKey"], _sum: { boughtTimes: true } }),
  ]);
  const bought = new Map(revenue.map((row) => [row.itemKey, row._sum.boughtTimes ?? 0]));

  return items.map((item) => ({
    ...item,
    buyers: item._count.purchases,
    boughtTimes: bought.get(item.key) ?? 0,
    earnedVc: (bought.get(item.key) ?? 0) * item.priceVc,
    feature: ((item.payload ?? {}) as Record<string, unknown>).feature ?? "",
  }));
}
