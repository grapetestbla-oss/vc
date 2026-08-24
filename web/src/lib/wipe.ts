import { db } from "./db";
import { audit } from "./audit";

/**
 * Обнуление аккаунта. Снимает всё, что игрок накопил: баланс, осколки,
 * наигранное время, косметику, открытия кейсов и покупки магазина. Наказания
 * и журнал не трогаем — они и есть история, ради которой обнуление делают.
 *
 * Инвентарь в игре чистит плагин: сюда кладём поручение, которое он заберёт,
 * когда игрок окажется в сети.
 */
export async function wipeAccount(params: {
  userId: string;
  adminId: string;
  reason: string;
  clearInventory: boolean;
}) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { id: true, login: true, balanceVc: true, shards: true, playtimeSec: true },
  });

  const removed = await db.$transaction(async (tx) => {
    // Списание баланса проводим транзакцией, чтобы деньги не исчезли из
    // отчётности молча: в истории останется строка с причиной.
    if (user.balanceVc !== 0) {
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "ADMIN_ADJUST",
          amount: -user.balanceVc,
          balanceAfter: 0,
          meta: { reason: params.reason, action: "wipe" },
        },
      });
    }

    const cosmetics = await tx.userCosmetic.deleteMany({ where: { userId: user.id } });
    const openings = await tx.caseOpening.deleteMany({ where: { userId: user.id } });
    const rounds = await tx.gameRound.deleteMany({ where: { userId: user.id } });
    const purchases = await tx.shopPurchase.deleteMany({ where: { userId: user.id } });
    await tx.pityCounter.deleteMany({ where: { userId: user.id } });
    await tx.seed.deleteMany({ where: { userId: user.id } });

    await tx.user.update({
      where: { id: user.id },
      data: { balanceVc: 0, shards: 0, playtimeSec: 0 },
    });

    return {
      cosmetics: cosmetics.count,
      openings: openings.count,
      rounds: rounds.count,
      purchases: purchases.count,
    };
  });

  if (params.clearInventory) {
    await db.serverAction.create({
      data: { kind: "WIPE_INVENTORY", login: user.login, userId: user.id },
    });
  }

  await audit({
    actorId: params.adminId,
    action: "admin.account.wipe",
    targetUserId: user.id,
    meta: {
      reason: params.reason,
      clearInventory: params.clearInventory,
      before: { balanceVc: user.balanceVc, shards: user.shards, playtimeSec: user.playtimeSec },
      removed,
    },
  });

  return { ...removed, before: user };
}
