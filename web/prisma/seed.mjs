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
      shardPrice: cosmetic.shardPrice ?? null,
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
      sortOrder: caseSeed.sortOrder,
      active: true,
    };
    await db.caseType.upsert({
      where: { key: caseSeed.key },
      create: { key: caseSeed.key, ...data },
      update: data,
    });

    await db.caseItem.deleteMany({ where: { caseKey: caseSeed.key } });
    await db.caseItem.createMany({
      data: caseSeed.items.map((item) => ({
        caseKey: caseSeed.key,
        kind: item.kind,
        cosmeticKey: item.kind === "COSMETIC" ? item.cosmeticKey : null,
        amount: item.kind === "COSMETIC" ? null : item.amount,
        weight: item.weight,
      })),
    });
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
