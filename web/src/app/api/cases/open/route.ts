import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { applyTransaction, InsufficientFunds } from "@/lib/economy";
import { nextRoll } from "@/lib/games";
import { rateLimit } from "@/lib/ratelimit";

/** Открытие кейса. Предмет выбирается взвешенным броском по той же схеме fairness. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`case:${user.id}`, 60, 60)) {
    return Response.json({ error: "Слишком быстро" }, { status: 429 });
  }

  const { caseKey } = (await request.json()) as { caseKey?: string };
  if (!caseKey) return Response.json({ error: "caseKey required" }, { status: 400 });

  const caseType = await db.caseType.findUnique({
    where: { key: caseKey },
    include: { items: true },
  });
  if (!caseType || !caseType.active || caseType.items.length === 0) {
    return Response.json({ error: "Кейс недоступен" }, { status: 404 });
  }

  try {
    await applyTransaction({
      userId: user.id,
      type: "CASE_OPEN",
      amount: -caseType.priceVc,
      meta: { case: caseType.key },
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      return Response.json({ error: "Недостаточно VC" }, { status: 400 });
    }
    throw error;
  }

  const { value, serverSeedHash, clientSeed, nonce } = await nextRoll(user.id);
  const totalWeight = caseType.items.reduce((sum, item) => sum + item.weight, 0);
  let point = value * totalWeight;
  const item = caseType.items.find((candidate) => (point -= candidate.weight) < 0) ?? caseType.items[0];

  const payload = item.payload as Record<string, unknown>;
  let rewardVc = 0;
  if (item.kind === "VC" && typeof payload.vc === "number") {
    rewardVc = payload.vc;
    await applyTransaction({
      userId: user.id,
      type: "CASE_REWARD",
      amount: rewardVc,
      meta: { case: caseType.key, item: item.name },
    });
  }
  if (item.kind === "COSMETIC" && typeof payload.cosmetic === "string") {
    await db.userCosmetic.upsert({
      where: { userId_key: { userId: user.id, key: payload.cosmetic } },
      create: { userId: user.id, key: payload.cosmetic },
      update: {},
    });
  }

  await db.caseOpening.create({
    data: {
      userId: user.id,
      caseKey: caseType.key,
      itemId: item.id,
      priceVc: caseType.priceVc,
      serverSeedHash,
      clientSeed,
      nonce,
    },
  });

  const fresh = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { balanceVc: true },
  });

  return Response.json({
    item: { name: item.name, kind: item.kind, rarity: item.rarity, payload: item.payload },
    rewardVc,
    balance: fresh.balanceVc,
    fairness: { serverSeedHash, clientSeed, nonce },
  });
}
