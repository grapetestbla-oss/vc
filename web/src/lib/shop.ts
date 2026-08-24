import { db } from "./db";
import { applyTransaction, InsufficientFunds } from "./economy";
import { levelFromPlaytime } from "./levels";
import type { ShopItem } from "@prisma/client";

export class ShopError extends Error {}

export const CATEGORY_LABEL: Record<string, string> = {
  teleport: "Перемещение",
  utility: "Удобства",
  insurance: "Страховка",
};

/** Витрина: только активные товары, в порядке сортировки каталога. */
export function listShopItems() {
  return db.shopItem.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { priceVc: "asc" }] });
}

/**
 * Покупка. Заряды складываются: купил «телепорт ×5» дважды — стало 10.
 * Постоянные товары повторно не продаём, чтобы не списать VC впустую.
 */
export async function buyShopItem(userId: string, key: string) {
  const item = await db.shopItem.findUnique({ where: { key } });
  if (!item || !item.active) throw new ShopError("Товар недоступен");

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { playtimeSec: true },
  });
  const level = levelFromPlaytime(user.playtimeSec);
  if (level < item.requiredLevel) {
    throw new ShopError(`Нужен уровень аккаунта ${item.requiredLevel}, у вас ${level}`);
  }

  const existing = await db.shopPurchase.findUnique({
    where: { userId_itemKey: { userId, itemKey: key } },
  });
  if (existing?.permanent) throw new ShopError("Этот товар уже куплен навсегда");

  try {
    const balance = await db.$transaction(async (tx) => {
      const left = await applyTransaction({
        userId,
        type: "SHOP_BUY",
        amount: -item.priceVc,
        meta: { itemKey: item.key, title: item.title },
        tx,
      });

      const permanent = item.kind === "PERMANENT";
      await tx.shopPurchase.upsert({
        where: { userId_itemKey: { userId, itemKey: key } },
        create: {
          userId,
          itemKey: key,
          chargesLeft: permanent ? 0 : item.charges,
          permanent,
        },
        update: {
          chargesLeft: { increment: item.charges },
          boughtTimes: { increment: 1 },
        },
      });

      return left;
    });

    return { balance, item };
  } catch (error) {
    if (error instanceof InsufficientFunds) throw new ShopError("Недостаточно VC");
    throw error;
  }
}

/** Что у игрока куплено — этим списком плагин решает, доступна ли команда. */
export async function purchasesFor(userId: string) {
  return db.shopPurchase.findMany({
    where: { userId, OR: [{ permanent: true }, { chargesLeft: { gt: 0 } }] },
    include: { item: true },
  });
}

/**
 * Списание заряда. Считает база, а не плагин: перезаход на сервер или две
 * команды подряд не должны давать лишнее использование.
 */
export async function consumeCharge(userId: string, key: string): Promise<{ item: ShopItem; left: number }> {
  const purchase = await db.shopPurchase.findUnique({
    where: { userId_itemKey: { userId, itemKey: key } },
    include: { item: true },
  });
  if (!purchase) throw new ShopError("Товар не куплен");

  if (purchase.permanent) {
    await db.shopPurchase.update({
      where: { id: purchase.id },
      data: { lastUsedAt: new Date() },
    });
    return { item: purchase.item, left: -1 };
  }

  const updated = await db.shopPurchase.updateMany({
    where: { id: purchase.id, chargesLeft: { gt: 0 } },
    data: { chargesLeft: { decrement: 1 }, lastUsedAt: new Date() },
  });
  if (updated.count === 0) throw new ShopError("Использования закончились");

  const fresh = await db.shopPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  return { item: purchase.item, left: fresh.chargesLeft };
}

/** Плагин сохраняет состояние товара — например, координаты дома. */
export async function saveState(userId: string, key: string, data: unknown) {
  const purchase = await db.shopPurchase.findUnique({
    where: { userId_itemKey: { userId, itemKey: key } },
  });
  if (!purchase) throw new ShopError("Товар не куплен");
  await db.shopPurchase.update({
    where: { id: purchase.id },
    data: { data: data as never },
  });
}
