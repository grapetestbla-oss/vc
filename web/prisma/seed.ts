import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Стартовые кейсы. Внутри только косметика и VC — никакого игрового преимущества. */
const CASES = [
  {
    key: "starter",
    name: "Стартовый кейс",
    priceVc: 100,
    items: [
      { name: "50 VC", kind: "VC" as const, payload: { vc: 50 }, weight: 400, rarity: "common" },
      { name: "100 VC", kind: "VC" as const, payload: { vc: 100 }, weight: 250, rarity: "common" },
      { name: "250 VC", kind: "VC" as const, payload: { vc: 250 }, weight: 80, rarity: "rare" },
      { name: "Серый ник", kind: "COSMETIC" as const, payload: { cosmetic: "name_gray" }, weight: 150, rarity: "common" },
      { name: "Зелёный ник", kind: "COSMETIC" as const, payload: { cosmetic: "name_green" }, weight: 100, rarity: "rare" },
      { name: "Золотой ник", kind: "COSMETIC" as const, payload: { cosmetic: "name_gold" }, weight: 20, rarity: "epic" },
    ],
  },
  {
    key: "prefix",
    name: "Кейс префиксов",
    priceVc: 300,
    items: [
      { name: "100 VC", kind: "VC" as const, payload: { vc: 100 }, weight: 350, rarity: "common" },
      { name: "Префикс Ветеран", kind: "COSMETIC" as const, payload: { cosmetic: "prefix_veteran" }, weight: 200, rarity: "common" },
      { name: "Префикс Шахтёр", kind: "COSMETIC" as const, payload: { cosmetic: "prefix_miner" }, weight: 200, rarity: "common" },
      { name: "Префикс Легенда", kind: "COSMETIC" as const, payload: { cosmetic: "prefix_legend" }, weight: 40, rarity: "epic" },
      { name: "1000 VC", kind: "VC" as const, payload: { vc: 1000 }, weight: 10, rarity: "legendary" },
    ],
  },
];

async function main() {
  for (const caseType of CASES) {
    await db.caseType.upsert({
      where: { key: caseType.key },
      create: { key: caseType.key, name: caseType.name, priceVc: caseType.priceVc },
      update: { name: caseType.name, priceVc: caseType.priceVc },
    });
    await db.caseItem.deleteMany({ where: { caseKey: caseType.key } });
    await db.caseItem.createMany({
      data: caseType.items.map((item) => ({ ...item, caseKey: caseType.key })),
    });
  }
  console.log("Кейсы загружены");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
