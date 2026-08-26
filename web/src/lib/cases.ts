import { db } from "./db";
import { applyTransaction, InsufficientFunds } from "./economy";
import { nextRoll } from "./games";
import { claimCollections, grantCosmetic } from "./cosmetics";
import type { CaseItem, Cosmetic } from "@prisma/client";

/** Предмет кейса вместе с подтянутой косметикой — так видно редкость. */
type CaseItemWithCosmetic = CaseItem & { cosmetic: Cosmetic | null };

export class CaseError extends Error {}

/** Кладёт объявление о редкой находке в очередь поручений плагину. */
async function announceDrop(params: {
  userId: string;
  caseName: string;
  cosmeticName: string;
  rarity: string;
}) {
  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { login: true },
  });
  if (!user) return;

  await db.serverAction.create({
    data: {
      kind: "BROADCAST_DROP",
      login: user.login,
      userId: params.userId,
      payload: {
        cosmetic: params.cosmeticName,
        rarity: params.rarity,
        case: params.caseName,
      },
    },
  });
}

/**
 * Покупка кейса в игре: VC списываются сразу, а кейс превращается в «билет».
 * Открывается он потом — когда игрок поставит блок и увидит анимацию.
 */
export async function purchaseCaseTicket(userId: string, caseKey: string) {
  const caseType = await db.caseType.findUnique({ where: { key: caseKey } });
  if (!caseType || !caseType.active) throw new CaseError("Кейс недоступен");
  if (caseType.freeDaily) throw new CaseError("Этот кейс открывается бесплатно на сайте");
  if (caseType.availableUntil && caseType.availableUntil < new Date()) {
    throw new CaseError("Сезон этого кейса закончился");
  }

  try {
    const balance = await applyTransaction({
      userId,
      type: "CASE_OPEN",
      amount: -caseType.priceVc,
      meta: { case: caseType.key, source: "game" },
    });
    const ticket = await db.caseTicket.create({ data: { userId, caseKey } });
    return { ticket, balance, caseType };
  } catch (error) {
    if (error instanceof InsufficientFunds) throw new CaseError("Недостаточно VC");
    throw error;
  }
}

/** Гасит билет и открывает кейс: списание уже прошло при покупке. */
export async function openPurchasedCase(userId: string, caseKey: string) {
  const ticket = await db.caseTicket.findFirst({
    where: { userId, caseKey, usedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!ticket) throw new CaseError("Оплаченного кейса нет");

  // Гасим условно: два блока, поставленных подряд, не откроют один билет дважды.
  const claimed = await db.caseTicket.updateMany({
    where: { id: ticket.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw new CaseError("Кейс уже открыт");

  return openCase(userId, caseKey, { prepaid: true });
}

/** Сколько оплаченных кейсов ждёт открытия — плагин выдаёт их предметами. */
export async function pendingTickets(userId: string) {
  const tickets = await db.caseTicket.groupBy({
    by: ["caseKey"],
    where: { userId, usedAt: null },
    _count: { _all: true },
  });
  return tickets.map((row) => ({ caseKey: row.caseKey, count: row._count._all }));
}

export type OpenResult = {
  kind: "VC" | "SHARDS" | "COSMETIC";
  amount: number;
  cosmetic: Cosmetic | null;
  duplicate: boolean;
  serial: number | null;
  fromPity: boolean;
  balanceVc: number;
  shards: number;
  pity: { current: number; threshold: number };
  collectionRewards: string[];
  fairness: { serverSeedHash: string; clientSeed: string; nonce: number };
};

function pickWeighted(items: CaseItemWithCosmetic[], roll: number): CaseItemWithCosmetic {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let point = roll * total;
  return items.find((item) => (point -= item.weight) < 0) ?? items[items.length - 1];
}

/** Прошло ли меньше суток с последнего бесплатного открытия. */
async function freeOpenUsed(userId: string, caseKey: string): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000);
  const opening = await db.caseOpening.findFirst({
    where: { userId, caseKey, createdAt: { gt: since } },
  });
  return Boolean(opening);
}

/**
 * Открытие кейса. prepaid — кейс уже оплачен заранее (куплен в игре и лежал
 * предметом в инвентаре), поэтому второй раз VC не списываем.
 */
export async function openCase(
  userId: string,
  caseKey: string,
  options: { prepaid?: boolean } = {},
): Promise<OpenResult> {
  const caseType = await db.caseType.findUnique({
    where: { key: caseKey },
    include: { items: { include: { cosmetic: true } } },
  });

  if (!caseType || !caseType.active || caseType.items.length === 0) {
    throw new CaseError("Кейс недоступен");
  }
  if (caseType.availableUntil && caseType.availableUntil < new Date()) {
    throw new CaseError("Сезон этого кейса закончился");
  }

  const free = caseType.freeDaily;
  if (free && (await freeOpenUsed(userId, caseKey))) {
    throw new CaseError("Бесплатное открытие уже было. Возвращайтесь завтра.");
  }

  if (!free && !options.prepaid && caseType.priceVc > 0) {
    try {
      await applyTransaction({
        userId,
        type: "CASE_OPEN",
        amount: -caseType.priceVc,
        meta: { case: caseType.key },
      });
    } catch (error) {
      if (error instanceof InsufficientFunds) throw new CaseError("Недостаточно VC");
      throw error;
    }
  }

  const { value, serverSeedHash, clientSeed, nonce } = await nextRoll(userId);

  // Гарант: досчитали до порога — выдаём легендарку принудительно.
  const pity = caseType.pityThreshold
    ? await db.pityCounter.upsert({
        where: { userId_caseKey: { userId, caseKey } },
        create: { userId, caseKey, count: 0 },
        update: {},
      })
    : null;

  const legendaries = caseType.items.filter(
    (item) => item.cosmetic?.rarity === "legendary",
  );
  const forcedByPity =
    Boolean(pity) &&
    caseType.pityThreshold > 0 &&
    pity!.count + 1 >= caseType.pityThreshold &&
    legendaries.length > 0;

  const item = forcedByPity
    ? pickWeighted(legendaries, value)
    : pickWeighted(caseType.items, value);

  const result = await db.$transaction(async (tx) => {
    let amount = 0;
    let duplicate = false;
    let serial: number | null = null;
    let shardsGained = 0;

    if (item.kind === "VC") {
      amount = item.amount ?? 0;
      await applyTransaction({
        userId,
        type: "CASE_REWARD",
        amount,
        meta: { case: caseType.key },
        tx,
      });
    } else if (item.kind === "SHARDS") {
      amount = item.amount ?? 0;
      shardsGained = amount;
    } else if (item.cosmeticKey) {
      const granted = await grantCosmetic(tx, userId, item.cosmeticKey);
      duplicate = !granted.granted;
      serial = granted.serial;
      shardsGained = granted.shards;
      amount = granted.shards;
    }

    if (shardsGained > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { shards: { increment: shardsGained } },
      });
    }

    const collectionRewards = item.kind === "COSMETIC" ? await claimCollections(tx, userId) : [];

    await tx.caseOpening.create({
      data: {
        userId,
        caseKey: caseType.key,
        itemId: item.id,
        priceVc: free || options.prepaid ? 0 : caseType.priceVc,
        duplicate,
        fromPity: forcedByPity,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });

    if (caseType.pityThreshold > 0) {
      const isLegendary = item.cosmetic?.rarity === "legendary";
      await tx.pityCounter.update({
        where: { userId_caseKey: { userId, caseKey } },
        data: isLegendary ? { count: 0 } : { count: { increment: 1 } },
      });
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { balanceVc: true, shards: true },
    });
    const counter = caseType.pityThreshold
      ? await tx.pityCounter.findUnique({
          where: { userId_caseKey: { userId, caseKey } },
        })
      : null;

    return {
      amount,
      duplicate,
      serial,
      balanceVc: user.balanceVc,
      shards: user.shards,
      pityCurrent: counter?.count ?? 0,
      collectionRewards,
    };
  });

  // Редкая находка — событие для всего сервера: о ней объявляет плагин.
  if (item.cosmetic && (item.cosmetic.rarity === "epic" || item.cosmetic.rarity === "legendary")) {
    await announceDrop({
      userId,
      caseName: caseType.name,
      cosmeticName: item.cosmetic.name,
      rarity: item.cosmetic.rarity,
    });
  }

  return {
    kind: item.kind,
    amount: result.amount,
    cosmetic: item.cosmetic,
    duplicate: result.duplicate,
    serial: result.serial,
    fromPity: forcedByPity,
    balanceVc: result.balanceVc,
    shards: result.shards,
    pity: { current: result.pityCurrent, threshold: caseType.pityThreshold },
    collectionRewards: result.collectionRewards,
    fairness: { serverSeedHash, clientSeed, nonce },
  };
}

/** Покупка конкретного предмета за осколки — лечит невезение в кейсах. */
export async function buyWithShards(userId: string, key: string) {
  return db.$transaction(async (tx) => {
    const cosmetic = await tx.cosmetic.findUnique({ where: { key } });
    if (!cosmetic || !cosmetic.shardPrice) throw new CaseError("Этот предмет не продаётся");

    const owned = await tx.userCosmetic.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (owned) throw new CaseError("Он у вас уже есть");

    const updated = await tx.user.updateMany({
      where: { id: userId, shards: { gte: cosmetic.shardPrice } },
      data: { shards: { decrement: cosmetic.shardPrice } },
    });
    if (updated.count === 0) throw new CaseError("Не хватает осколков");

    const granted = await grantCosmetic(tx, userId, key);
    if (!granted.granted) {
      throw new CaseError("Экземпляры этого предмета закончились");
    }
    const rewards = await claimCollections(tx, userId);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { shards: true },
    });

    return { shards: user.shards, serial: granted.serial, collectionRewards: rewards };
  });
}
