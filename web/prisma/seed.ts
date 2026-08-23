import { PrismaClient, type Prisma } from "@prisma/client";
import { COSMETICS, COLLECTIONS } from "./catalogue";
import { CASES } from "./cases";

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
      payload: cosmetic.payload as Prisma.InputJsonValue,
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

  console.log(
    `Каталог загружен: косметики ${COSMETICS.length}, коллекций ${COLLECTIONS.length}, кейсов ${CASES.length}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
