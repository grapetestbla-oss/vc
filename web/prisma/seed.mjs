import { PrismaClient } from "@prisma/client";
import { COSMETICS, COLLECTIONS } from "./catalogue.mjs";
import { CASES } from "./cases.mjs";
import { SHOP_ITEMS } from "./shop.mjs";

const db = new PrismaClient();

async function main() {
  // Коллекции создаём без наград: награда — тоже косметика, её ещё нет.
  for (const collection of COLLECTIONS) {
    await db.collection.upsert({
      where: { key: collection.key },
      create: { key: collection.key, name: collection.name, seasonKey: collection.seasonKey },
      update: { name: collection.name, seasonKey: collection.seasonKey },
    });
  }

  for (const cosmetic of COSMETICS) {
    const data = {
      name: cosmetic.name,
      description: cosmetic.description,
      kind: cosmetic.kind,
      rarity: cosmetic.rarity,
      payload: cosmetic.payload,
      seasonKey: cosmetic.seasonKey ?? null,
      collectionKey: cosmetic.collectionKey ?? null,
      serialLimit: cosmetic.serialLimit ?? null,
      obtainable: cosmetic.obtainable ?? true,
      priceVc: cosmetic.priceVc ?? null,
    };
    await db.cosmetic.upsert({
      where: { key: cosmetic.key },
      create: { key: cosmetic.key, ...data },
      update: data,
    });
  }

  // Теперь награды за коллекции существуют — привязываем.
  for (const collection of COLLECTIONS) {
    await db.collection.update({
      where: { key: collection.key },
      data: { rewardKey: collection.rewardKey },
    });
  }

  for (const caseSeed of CASES) {
    const data = {
      name: caseSeed.name,
      description: caseSeed.description,
      priceVc: caseSeed.priceVc,
      seasonKey: caseSeed.seasonKey ?? null,
      freeDaily: caseSeed.freeDaily ?? false,
      pityThreshold: caseSeed.pityThreshold ?? 0,
      imageUrl: caseSeed.imageUrl ?? null,
      accent: caseSeed.accent ?? null,
      sortOrder: caseSeed.sortOrder,
      // Срок временного кейса перезаписываем каждый раз: продлить или закрыть
      // событие должно быть можно правкой каталога, а не руками в базе.
      availableUntil: caseSeed.availableUntil ? new Date(caseSeed.availableUntil) : null,
      active: true,
    };
    await db.caseType.upsert({
      where: { key: caseSeed.key },
      create: { key: caseSeed.key, ...data },
      update: data,
    });

    // Содержимое кейса сверяем построчно, а не пересоздаём целиком. История
    // открытий ссылается на строку кейса каскадом: удаление и создание заново
    // стирало бы её при каждом запуске — вместе с записями provably fair и с
    // отметками о бесплатном открытии, после чего суточный ящик открывался бы
    // всем повторно.
    const existing = await db.caseItem.findMany({ where: { caseKey: caseSeed.key } });
    const signature = (item) =>
      [item.kind, item.cosmeticKey ?? "", item.amount ?? ""].join("|");
    const known = new Map(existing.map((row) => [signature(row), row]));
    const seen = new Set();

    for (const item of caseSeed.items) {
      const data = {
        kind: item.kind,
        cosmeticKey: item.kind === "COSMETIC" ? item.cosmeticKey : null,
        amount: item.kind === "COSMETIC" ? null : item.amount,
        weight: item.weight,
      };
      const key = signature(data);
      seen.add(key);

      const row = known.get(key);
      if (!row) {
        await db.caseItem.create({ data: { caseKey: caseSeed.key, ...data } });
      } else if (row.weight !== data.weight) {
        await db.caseItem.update({ where: { id: row.id }, data: { weight: data.weight } });
      }
    }

    // Убранное из каталога удаляем: вместе с ним уходит и история его выпадений,
    // но иначе выбывший предмет продолжал бы выпадать.
    for (const row of existing) {
      if (!seen.has(signature(row))) await db.caseItem.delete({ where: { id: row.id } });
    }
  }

  for (const item of SHOP_ITEMS) {
    const data = {
      title: item.title,
      description: item.description,
      category: item.category,
      priceVc: item.priceVc,
      kind: item.kind,
      charges: item.charges,
      payload: item.payload,
      requiredLevel: item.requiredLevel ?? 0,
      sort: item.sort,
      active: true,
    };
    await db.shopItem.upsert({
      where: { key: item.key },
      create: { key: item.key, ...data },
      update: data,
    });
  }

  console.log(
    `Каталог загружен: косметики ${COSMETICS.length}, коллекций ${COLLECTIONS.length}, ` +
      `кейсов ${CASES.length}, товаров магазина ${SHOP_ITEMS.length}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
