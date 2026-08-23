import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** Сколько осколков даёт дубль. Дубль не должен ощущаться потерей открытия. */
export const DUPLICATE_SHARDS: Record<string, number> = {
  common: 30,
  rare: 90,
  epic: 300,
  legendary: 900,
};

/** Косметика одного вида взаимоисключающая: два шлейфа сразу не носят. */
export async function equipCosmetic(
  userId: string,
  key: string,
  equipped: boolean,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? db;
  const owned = await client.userCosmetic.findUnique({
    where: { userId_key: { userId, key } },
    include: { cosmetic: true },
  });
  if (!owned) return null;

  if (equipped) {
    const sameKind = await client.cosmetic.findMany({
      where: { kind: owned.cosmetic.kind },
      select: { key: true },
    });
    await client.userCosmetic.updateMany({
      where: { userId, key: { in: sameKind.map((item) => item.key) } },
      data: { equipped: false },
    });
  }

  await client.userCosmetic.update({
    where: { userId_key: { userId, key } },
    data: { equipped },
  });
  return owned;
}

/**
 * Выдаёт косметику. Возвращает осколки вместо предмета, если он уже есть или
 * лимитированные экземпляры разобрали.
 */
export async function grantCosmetic(
  tx: Prisma.TransactionClient,
  userId: string,
  key: string,
): Promise<{ granted: boolean; serial: number | null; shards: number }> {
  const cosmetic = await tx.cosmetic.findUniqueOrThrow({ where: { key } });
  const shards = DUPLICATE_SHARDS[cosmetic.rarity] ?? 30;

  const existing = await tx.userCosmetic.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (existing) return { granted: false, serial: null, shards };

  let serial: number | null = null;
  if (cosmetic.serialLimit) {
    const issued = await tx.userCosmetic.count({ where: { key } });
    if (issued >= cosmetic.serialLimit) {
      // Экземпляры закончились — предмет больше не выдаём, компенсируем осколками.
      return { granted: false, serial: null, shards };
    }
    serial = issued + 1;
  }

  await tx.userCosmetic.create({ data: { userId, key, serial } });
  return { granted: true, serial, shards: 0 };
}

/**
 * Проверяет собранные коллекции и выдаёт награды. Награда не выпадает из
 * кейсов, получить её можно только так.
 */
export async function claimCollections(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string[]> {
  const collections = await tx.collection.findMany({
    include: { items: { where: { obtainable: true }, select: { key: true } } },
  });
  const owned = new Set(
    (await tx.userCosmetic.findMany({ where: { userId }, select: { key: true } })).map(
      (item) => item.key,
    ),
  );

  const claimed: string[] = [];
  for (const collection of collections) {
    if (!collection.rewardKey || collection.items.length === 0) continue;
    if (owned.has(collection.rewardKey)) continue;
    if (!collection.items.every((item) => owned.has(item.key))) continue;

    await tx.userCosmetic.create({ data: { userId, key: collection.rewardKey } });
    claimed.push(collection.rewardKey);
  }
  return claimed;
}
