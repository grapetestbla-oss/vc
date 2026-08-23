import { db } from "./db";
import type { TxType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export class InsufficientFunds extends Error {
  constructor() {
    super("Недостаточно VC");
  }
}

/**
 * Единственный способ менять баланс. Атомарно: проверка, списание и запись
 * транзакции в одной операции, чтобы параллельные ставки не увели баланс в минус.
 */
export async function applyTransaction(params: {
  userId: string;
  type: TxType;
  amount: number;
  meta?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}): Promise<number> {
  const run = async (client: Prisma.TransactionClient) => {
    const updated =
      params.amount < 0
        ? await client.user.updateMany({
            where: { id: params.userId, balanceVc: { gte: -params.amount } },
            data: { balanceVc: { increment: params.amount } },
          })
        : await client.user.updateMany({
            where: { id: params.userId },
            data: { balanceVc: { increment: params.amount } },
          });

    if (updated.count === 0) throw new InsufficientFunds();

    const user = await client.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { balanceVc: true },
    });

    await client.transaction.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: params.amount,
        balanceAfter: user.balanceVc,
        meta: params.meta,
      },
    });

    return user.balanceVc;
  };

  return params.tx ? run(params.tx) : db.$transaction(run);
}
