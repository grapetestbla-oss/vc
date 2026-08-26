import { db } from "./db";
import { applyTransaction, InsufficientFunds } from "./economy";
import { audit } from "./audit";
import { CONFIG } from "./config";

export class DiceError extends Error {}

/** Незавершённая партия старше этого срока считается брошенной и возвращается. */
const STALE_MS = 5 * 60_000;

/**
 * Партия начинается со списания: обе ставки уходят в банк до броска. Иначе
 * проигравший успел бы потратить VC между броском и выплатой.
 */
export async function startMatch(params: {
  challengerLogin: string;
  opponentLogin: string;
  amount: number;
}) {
  const amount = Math.floor(params.amount);
  if (!Number.isFinite(amount) || amount < CONFIG.minBet) {
    throw new DiceError(`Минимальная ставка ${CONFIG.minBet} VC`);
  }
  if (params.challengerLogin === params.opponentLogin) {
    throw new DiceError("Сам с собой играть нельзя");
  }

  await refundStale();

  const [challenger, opponent] = await Promise.all([
    db.user.findUnique({ where: { login: params.challengerLogin }, select: { id: true, balanceVc: true } }),
    db.user.findUnique({ where: { login: params.opponentLogin }, select: { id: true, balanceVc: true } }),
  ]);
  if (!challenger || !opponent) throw new DiceError("Игрок не найден");
  if (challenger.balanceVc < amount) throw new DiceError("У вас не хватает VC");
  if (opponent.balanceVc < amount) throw new DiceError("У соперника не хватает VC");

  const match = await db.diceMatch.create({
    data: { amount, challengerId: challenger.id, opponentId: opponent.id },
  });

  try {
    await applyTransaction({
      userId: challenger.id,
      type: "GAME_BET",
      amount: -amount,
      meta: { game: "DICE", matchId: match.id },
    });
    await applyTransaction({
      userId: opponent.id,
      type: "GAME_BET",
      amount: -amount,
      meta: { game: "DICE", matchId: match.id },
    });
  } catch (error) {
    // Один списался, второй нет — возвращаем всё и партию не начинаем.
    await refundMatch(match.id);
    if (error instanceof InsufficientFunds) throw new DiceError("Не хватило VC на ставку");
    throw error;
  }

  return { matchId: match.id, amount };
}

/** Выплата победителю. Броски присылает плагин, банк — двойная ставка. */
export async function finishMatch(params: {
  matchId: string;
  challengerRoll: number;
  opponentRoll: number;
}) {
  const match = await db.diceMatch.findUnique({ where: { id: params.matchId } });
  if (!match) throw new DiceError("Партия не найдена");
  if (match.status !== "escrow") throw new DiceError("Партия уже завершена");

  const a = Math.floor(params.challengerRoll);
  const b = Math.floor(params.opponentRoll);
  if (![a, b].every((value) => Number.isFinite(value) && value >= 1 && value <= 6)) {
    throw new DiceError("Бросок вне диапазона 1–6");
  }
  if (a === b) throw new DiceError("Ничья — нужен переброс");

  const winnerId = a > b ? match.challengerId : match.opponentId;

  const claimed = await db.diceMatch.updateMany({
    where: { id: match.id, status: "escrow" },
    data: {
      status: "paid",
      challengerRoll: a,
      opponentRoll: b,
      winnerId,
      settledAt: new Date(),
    },
  });
  if (claimed.count === 0) throw new DiceError("Партия уже завершена");

  const balance = await applyTransaction({
    userId: winnerId,
    type: "GAME_WIN",
    amount: match.amount * 2,
    meta: { game: "DICE", matchId: match.id },
  });
  await audit({
    actorId: null,
    action: "dice.settle",
    targetUserId: winnerId,
    meta: { matchId: match.id, amount: match.amount, rolls: { a, b } },
  });

  const winner = await db.user.findUniqueOrThrow({
    where: { id: winnerId },
    select: { login: true },
  });

  return { winnerLogin: winner.login, pot: match.amount * 2, balance };
}

/** Возврат ставок: ничья без переброса, отказ соперника или зависшая партия. */
export async function refundMatch(matchId: string) {
  const match = await db.diceMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "escrow") return;

  const claimed = await db.diceMatch.updateMany({
    where: { id: matchId, status: "escrow" },
    data: { status: "refunded", settledAt: new Date() },
  });
  if (claimed.count === 0) return;

  // Возвращаем только то, что реально списалось: партия могла оборваться
  // на середине, когда со второго игрока деньги ещё не сняли.
  for (const userId of [match.challengerId, match.opponentId]) {
    const taken = await db.transaction.findFirst({
      where: {
        userId,
        type: "GAME_BET",
        meta: { path: ["matchId"], equals: matchId },
      },
    });
    if (!taken) continue;
    await applyTransaction({
      userId,
      type: "GAME_WIN",
      amount: match.amount,
      meta: { game: "DICE", matchId, refund: true },
    });
  }
}

/** Подчищает брошенные партии — например, если сервер упал между броском и выплатой. */
export async function refundStale() {
  const stale = await db.diceMatch.findMany({
    where: { status: "escrow", createdAt: { lt: new Date(Date.now() - STALE_MS) } },
    select: { id: true },
    take: 20,
  });
  for (const match of stale) await refundMatch(match.id);
}
