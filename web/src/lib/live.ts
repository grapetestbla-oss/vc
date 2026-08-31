import { db } from "./db";
import { CONFIG } from "./config";
import { applyTransaction, InsufficientFunds } from "./economy";
import { crashPoint, newServerSeed, roll as hmacRoll } from "./fairness";
import { gameEnabled, GAME_LABEL } from "./gameflags";
import type { LiveGame, Prisma } from "@prisma/client";

export class LiveError extends Error {}

/** Ставки принимаются 20 секунд, ещё 10 идёт розыгрыш и показ результата. */
export const ROUND_MS = CONFIG.liveRoundMs;
export const BETTING_MS = Math.min(CONFIG.liveBettingMs, ROUND_MS - 1000);

/** Точка отсчёта расписания. Номер раунда считается от неё, а не от старта процесса. */
const EPOCH = Date.UTC(2026, 0, 1);

/**
 * Раскладка колеса: 41 равный сектор — 18 по x2, 12 по x3, 7 по x5 и 4 по x10.
 * Порядок жёстко зафиксирован: колесо должно выглядеть одинаково у всех и не
 * меняться между перезапусками сайта. Одинаковые множители разведены по кругу,
 * чтобы не стояли блоками, — с учётом стыка через ноль: колесо круглое, и
 * последний сектор соседствует с первым.
 *
 * Раскладка подобрана под ставку на сектор: доля каждого множителя такая, что
 * средняя выплата по нему меньше ставки — 0.88 у x2 и x3, 0.85 у x5, 0.98 у
 * x10. Ни один сектор не выгоднее сайта, но и явно проигрышных нет, так что
 * выбор остаётся выбором, а не единственно верным вариантом.
 */
export const ROULETTE_LAYOUT = [
  2, 2, 3, 5, 2, 10, 3, 2, 2, 5, 3, 2, 3, 2, 3, 10, 5, 2, 2, 3, 5,
  2, 3, 2, 2, 3, 10, 5, 2, 3, 2, 2, 5, 3, 2, 2, 10, 3, 5, 2, 3,
] as const;

/** Множители, на которые можно поставить. */
export const ROULETTE_SECTORS = [2, 3, 5, 10] as const;
export type RouletteSector = (typeof ROULETTE_SECTORS)[number];

export function isRouletteSector(value: number): value is RouletteSector {
  return (ROULETTE_SECTORS as readonly number[]).includes(value);
}

/** Шанс и средняя выплата по каждому сектору — их же показываем игроку. */
export function rouletteOdds() {
  return ROULETTE_SECTORS.map((multiplier) => {
    const sectors = ROULETTE_LAYOUT.filter((value) => value === multiplier).length;
    const chance = sectors / ROULETTE_LAYOUT.length;
    return { multiplier, sectors, chance, rtp: chance * multiplier };
  });
}

export type Phase = "betting" | "resolving";

export function roundNumberAt(time: number): number {
  return Math.floor((time - EPOCH) / ROUND_MS);
}

export function roundWindow(number: number) {
  const startedAt = new Date(EPOCH + number * ROUND_MS);
  return {
    startedAt,
    lockAt: new Date(startedAt.getTime() + BETTING_MS),
    endsAt: new Date(startedAt.getTime() + ROUND_MS),
  };
}

/** Множитель раунда: бросок [0,1) выбирает сектор — все они одинаковой ширины. */
export function rouletteResult(value: number): number {
  const index = Math.min(
    ROULETTE_LAYOUT.length - 1,
    Math.floor(value * ROULETTE_LAYOUT.length),
  );
  return ROULETTE_LAYOUT[index];
}

/** Границы секторов для отрисовки колеса: клиент рисует ровно то, что считаем здесь. */
export function rouletteZones() {
  const size = 1 / ROULETTE_LAYOUT.length;
  return ROULETTE_LAYOUT.map((multiplier, index) => ({
    multiplier,
    until: (index + 1) * size,
    chance: size,
  }));
}

async function createRound(game: LiveGame, number: number) {
  const window = roundWindow(number);
  const { serverSeed, serverSeedHash } = newServerSeed();
  try {
    return await db.liveRound.create({
      data: { game, number, ...window, serverSeed, serverSeedHash },
    });
  } catch {
    // Два параллельных запроса могли создать раунд одновременно — берём готовый.
    return db.liveRound.findUniqueOrThrow({ where: { game_number: { game, number } } });
  }
}

/**
 * Разыгрывает раунд, если время ставок вышло. Условное обновление гарантирует,
 * что при одновременных запросах выплата пройдёт ровно один раз.
 */
async function resolveRound(roundId: string) {
  const round = await db.liveRound.findUnique({ where: { id: roundId } });
  if (!round || round.resolvedAt) return;
  if (round.lockAt > new Date()) return;

  const value = hmacRoll(round.serverSeed, `${round.game}`, round.number);
  const result = round.game === "CRASH" ? crashPoint(value, CONFIG.rtp) : rouletteResult(value);

  const claimed = await db.liveRound.updateMany({
    where: { id: roundId, resolvedAt: null },
    data: { roll: value, result, resolvedAt: new Date() },
  });
  if (claimed.count === 0) return;

  // Ставки перечитываем после захвата раунда: ставка могла закоммититься между
  // первым чтением и захватом — тогда игрок остался бы списанным без выплаты.
  const bets = await db.liveBet.findMany({ where: { roundId } });

  for (const bet of bets) {
    // В рулетке игрок выбирает сектор: совпал множитель — платим по нему.
    const payout =
      round.game === "CRASH"
        ? bet.target <= result
          ? Math.floor(bet.betVc * bet.target)
          : 0
        : bet.target === result
          ? Math.floor(bet.betVc * result)
          : 0;
    const won = payout >= bet.betVc;

    await db.liveBet.update({
      where: { id: bet.id },
      data: { won, payoutVc: payout },
    });

    if (payout > 0) {
      await applyTransaction({
        userId: bet.userId,
        type: "GAME_WIN",
        amount: payout,
        meta: { game: round.game, round: round.number, target: bet.target },
      });
    }

    // Дублируем в общую историю игр: панель и кабинет считают статистику по ней.
    await db.gameRound.create({
      data: {
        userId: bet.userId,
        game: round.game,
        betVc: bet.betVc,
        target: bet.target,
        result,
        payoutVc: payout,
        won,
        serverSeedHash: round.serverSeedHash,
        clientSeed: `${round.game}`,
        nonce: round.number,
      },
    });
  }
}

/** Приводит расписание в порядок: доигрывает прошлые раунды и открывает текущий. */
export async function syncRounds(game: LiveGame) {
  const now = Date.now();
  const current = roundNumberAt(now);

  const pending = await db.liveRound.findMany({
    where: { game, resolvedAt: null, lockAt: { lte: new Date(now) } },
    select: { id: true },
    orderBy: { number: "asc" },
    take: 20,
  });
  for (const round of pending) await resolveRound(round.id);

  const existing = await db.liveRound.findUnique({
    where: { game_number: { game, number: current } },
  });
  return existing ?? (await createRound(game, current));
}

export function phaseOf(round: { lockAt: Date }): Phase {
  return round.lockAt > new Date() ? "betting" : "resolving";
}

/** Состояние стола для клиента: текущий раунд, чужие ставки и прошлые результаты. */
export async function tableState(game: LiveGame, userId: string | null) {
  const round = await syncRounds(game);

  const [bets, history] = await Promise.all([
    db.liveBet.findMany({
      where: { roundId: round.id },
      orderBy: { betVc: "desc" },
      take: 40,
      include: { user: { select: { login: true } } },
    }),
    db.liveRound.findMany({
      where: { game, resolvedAt: { not: null } },
      orderBy: { number: "desc" },
      take: 15,
      select: {
        number: true,
        result: true,
        roll: true,
        serverSeed: true,
        serverSeedHash: true,
        resolvedAt: true,
      },
    }),
  ]);

  return {
    now: Date.now(),
    round: {
      number: round.number,
      phase: phaseOf(round),
      startedAt: round.startedAt.getTime(),
      lockAt: round.lockAt.getTime(),
      endsAt: round.endsAt.getTime(),
      serverSeedHash: round.serverSeedHash,
      // Результат отдаём только после розыгрыша: до него его нет и в базе.
      result: round.resolvedAt ? round.result : null,
      roll: round.resolvedAt ? round.roll : null,
    },
    bets: bets.map((bet) => ({
      login: bet.user.login,
      betVc: bet.betVc,
      target: bet.target,
      payoutVc: bet.payoutVc,
      won: bet.won,
      mine: bet.userId === userId,
    })),
    history: history.map((item) => ({
      number: item.number,
      result: item.result,
      roll: item.roll,
      serverSeed: item.serverSeed,
      serverSeedHash: item.serverSeedHash,
      at: item.resolvedAt?.getTime() ?? null,
    })),
    zones: game === "ROULETTE" ? rouletteZones() : [],
  };
}

/** Ставка в текущий раунд. Одна ставка на игрока: стол общий, а не личный. */
export async function placeBet(params: {
  game: LiveGame;
  userId: string;
  bet: number;
  target: number;
}) {
  const stake = Math.floor(params.bet);
  if (!Number.isFinite(stake) || stake < CONFIG.minBet) {
    throw new LiveError(`Минимальная ставка ${CONFIG.minBet} VC`);
  }

  if (params.game === "ROULETTE") {
    if (!isRouletteSector(params.target)) {
      throw new LiveError("Выберите сектор: x2, x3, x5 или x10");
    }
  } else {
    if (!Number.isFinite(params.target) || params.target < 1.01 || params.target > 100) {
      throw new LiveError("Точка вывода от 1.01 до 100");
    }
  }

  // Выключенная игра принимать ставки не должна, но уже сделанные —
  // разыгрываются и выплачиваются: деньги игроков не зависают.
  if (!(await gameEnabled(params.game))) {
    throw new LiveError(`${GAME_LABEL[params.game]} временно выключена администрацией`);
  }

  const round = await syncRounds(params.game);
  if (phaseOf(round) !== "betting") throw new LiveError("Ставки на этот раунд закрыты");

  const existing = await db.liveBet.findUnique({
    where: { roundId_userId: { roundId: round.id, userId: params.userId } },
  });
  if (existing) throw new LiveError("Вы уже поставили в этом раунде");

  try {
    await applyTransaction({
      userId: params.userId,
      type: "GAME_BET",
      amount: -stake,
      meta: { game: params.game, round: round.number, target: params.target },
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) throw new LiveError("Недостаточно VC");
    throw error;
  }

  // В рулетке target — выбранный сектор, в краше — точка вывода.
  const target =
    params.game === "ROULETTE" ? params.target : Math.round(params.target * 100) / 100;
  const data: Prisma.LiveBetUncheckedCreateInput = {
    roundId: round.id,
    userId: params.userId,
    betVc: stake,
    target,
  };
  await db.liveBet.create({ data });

  return { round: round.number, betVc: stake, target };
}
