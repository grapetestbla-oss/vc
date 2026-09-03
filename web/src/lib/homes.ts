import { db } from "./db";
import { applyTransaction, InsufficientFunds } from "./economy";
import { levelFromPlaytime } from "./levels";
import { ShopError } from "./shop";

/**
 * Точки дома.
 *
 * Первая идёт вместе с покупкой «Точка дома» в магазине. Дальше — по одной за
 * каждые пять уровней аккаунта, и каждая следующая дороже предыдущей на 500 VC:
 * уровень открывает возможность, VC её оплачивают. Купить впрок нельзя, поэтому
 * десять домов на старте не появятся ни за какие деньги.
 */

/** Ключ товара «Точка дома»: он даёт первую точку. */
export const HOME_ITEM_KEY = "home_point";
/** Один слот на каждые столько уровней. */
export const LEVELS_PER_SLOT = 5;
/** Цена первого докупленного слота. */
export const FIRST_SLOT_PRICE = 2000;
/** На столько дорожает каждый следующий. */
export const SLOT_STEP = 500;

/** Имя дома по умолчанию — под ним живёт единственная точка старой покупки. */
export const DEFAULT_HOME = "дом";

/** Сколько слотов сверх базового открыл уровень. */
export function slotsUnlocked(level: number): number {
  return Math.floor(level / LEVELS_PER_SLOT);
}

/** Цена слота с номером next (1 — первый докупленный). */
export function slotPrice(next: number): number {
  return FIRST_SLOT_PRICE + SLOT_STEP * (next - 1);
}

export type HomeCapacity = {
  level: number;
  /** Есть ли базовая точка из магазина. */
  base: boolean;
  /** Сколько слотов докуплено. */
  bought: number;
  /** Сколько слотов открыто уровнем. */
  unlocked: number;
  /** Сколько домов можно держать всего. */
  total: number;
  /** Сколько занято. */
  used: number;
  /** Цена следующего слота — null, если докупать нечего. */
  nextPrice: number | null;
  /** Уровень, на котором откроется следующий слот, если он ещё не открыт. */
  nextLevel: number | null;
};

export async function homeCapacity(userId: string): Promise<HomeCapacity> {
  const [user, purchase, used] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { playtimeSec: true, homeSlots: true },
    }),
    db.shopPurchase.findUnique({
      where: { userId_itemKey: { userId, itemKey: HOME_ITEM_KEY } },
      select: { permanent: true },
    }),
    db.playerHome.count({ where: { userId } }),
  ]);

  const level = levelFromPlaytime(user.playtimeSec);
  const base = Boolean(purchase?.permanent);
  const bought = user.homeSlots;
  const unlocked = slotsUnlocked(level);
  const canBuyMore = base && bought < unlocked;

  return {
    level,
    base,
    bought,
    unlocked,
    total: (base ? 1 : 0) + bought,
    used,
    nextPrice: canBuyMore ? slotPrice(bought + 1) : null,
    nextLevel: base && bought >= unlocked ? (bought + 1) * LEVELS_PER_SLOT : null,
  };
}

/**
 * Докупает слот. Уровень проверяем внутри транзакции по свежим данным: между
 * показом цены на витрине и нажатием кнопки игрок мог купить слот в другой
 * вкладке, и обе покупки прошли бы по цене первой.
 */
export async function buyHomeSlot(userId: string): Promise<{ balance: number; price: number; total: number }> {
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { playtimeSec: true, homeSlots: true },
      });
      const purchase = await tx.shopPurchase.findUnique({
        where: { userId_itemKey: { userId, itemKey: HOME_ITEM_KEY } },
        select: { permanent: true },
      });
      if (!purchase?.permanent) {
        throw new ShopError("Сначала купите «Точку дома» в магазине");
      }

      const level = levelFromPlaytime(user.playtimeSec);
      const unlocked = slotsUnlocked(level);
      if (user.homeSlots >= unlocked) {
        const need = (user.homeSlots + 1) * LEVELS_PER_SLOT;
        throw new ShopError(`Следующая точка дома откроется на ${need} уровне, у вас ${level}`);
      }

      const price = slotPrice(user.homeSlots + 1);
      const balance = await applyTransaction({
        userId,
        type: "SHOP_BUY",
        amount: -price,
        meta: { itemKey: "home_slot", slot: user.homeSlots + 1 },
        tx,
      });

      const moved = await tx.user.updateMany({
        where: { id: userId, homeSlots: user.homeSlots },
        data: { homeSlots: { increment: 1 } },
      });
      if (moved.count === 0) throw new ShopError("Покупка не прошла, попробуйте ещё раз");

      return { balance, price, total: user.homeSlots + 2 };
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) throw new ShopError("Недостаточно VC");
    throw error;
  }
}

/**
 * Список домов. Заодно переносит единственную точку старой покупки: до слотов
 * координаты лежали в состоянии товара, и без переноса у всех, кто уже отметил
 * дом, он бы просто исчез.
 */
export async function listHomes(userId: string) {
  const homes = await db.playerHome.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { name: true, location: true },
  });
  if (homes.length > 0) return homes;

  const purchase = await db.shopPurchase.findUnique({
    where: { userId_itemKey: { userId, itemKey: HOME_ITEM_KEY } },
    select: { data: true },
  });
  const legacy = (purchase?.data as { location?: string } | null)?.location;
  if (!legacy) return homes;

  await db.playerHome.create({ data: { userId, name: DEFAULT_HOME, location: legacy } });
  return [{ name: DEFAULT_HOME, location: legacy }];
}

/** Имя приводим к одному виду, иначе «База» и «база» стали бы разными домами. */
export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

const NAME_PATTERN = /^[\p{L}\p{N}_-]{1,16}$/u;

export async function saveHome(userId: string, rawName: string, location: string) {
  const name = normalizeName(rawName || DEFAULT_HOME);
  if (!NAME_PATTERN.test(name)) {
    throw new ShopError("Имя дома: до 16 букв или цифр, без пробелов");
  }

  const homes = await listHomes(userId);
  const capacity = await homeCapacity(userId);
  if (!capacity.base) throw new ShopError("Точка дома не куплена");

  const exists = homes.some((home) => home.name === name);
  if (!exists && homes.length >= capacity.total) {
    throw new ShopError(`Все точки дома заняты (${capacity.total}). Удалите лишнюю или купите слот`);
  }

  await db.playerHome.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name, location },
    update: { location },
  });
  return { name, replaced: exists, total: capacity.total, used: exists ? homes.length : homes.length + 1 };
}

export async function deleteHome(userId: string, rawName: string) {
  const name = normalizeName(rawName);
  const removed = await db.playerHome.deleteMany({ where: { userId, name } });
  if (removed.count === 0) throw new ShopError("Такого дома нет");
  return { name };
}
