/**
 * Разовый перевод осколков в VC по курсу три к одному.
 *
 *   node scripts/shards-to-vc.mjs
 *
 * Запускается один раз при выкатке обновления, в котором осколки убраны. Второй
 * запуск ничего не делает: отметка о переводе лежит в настройках, и без неё
 * повторный прогон выплатил бы всем ещё раз.
 *
 * Перевод идёт транзакцией на каждого игрока, поэтому остаётся в истории
 * операций: игрок должен видеть, откуда у него появились эти VC.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const KEY = "shards_migrated";
const RATE = 3;

async function main() {
  const done = await db.setting.findUnique({ where: { key: KEY } });
  if (done) {
    console.log("Перевод уже был:", JSON.stringify(done.value));
    return;
  }

  const holders = await db.user.findMany({
    where: { shards: { gt: 0 } },
    select: { id: true, login: true, shards: true },
    orderBy: { shards: "desc" },
  });

  let paid = 0;
  let burned = 0;

  for (const user of holders) {
    const amount = Math.floor(user.shards / RATE);
    if (amount <= 0) {
      // Меньше трёх осколков в VC не превращаются — списываем молча, спорить
      // из-за нуля не о чем.
      burned += user.shards;
      await db.user.update({ where: { id: user.id }, data: { shards: 0 } });
      continue;
    }

    await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { balanceVc: { increment: amount }, shards: 0 },
        select: { balanceVc: true },
      });
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "EVENT",
          amount,
          balanceAfter: updated.balanceVc,
          meta: { reason: "shards_to_vc", shards: user.shards, rate: RATE },
        },
      });
    });

    paid += amount;
    console.log(`  ${user.login}: ${user.shards} осколков → ${amount} VC`);
  }

  await db.setting.create({
    data: {
      key: KEY,
      value: { at: new Date().toISOString(), players: holders.length, paidVc: paid, burned },
    },
  });

  console.log(`Переведено игроков: ${holders.length}, начислено ${paid} VC, сгорело ${burned} осколков.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
