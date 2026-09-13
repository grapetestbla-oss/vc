import { db } from "./db";
import { audit } from "./audit";

/**
 * Осенний ивент: большие задания за кейсы.
 *
 * Событие идёт две недели, и задания открываются не все сразу, а через день:
 * семь заданий на четырнадцать дней. Так у игрока всегда есть, чем заняться, но
 * нет стены из семи полосок в первый же вечер — пройти всё за выходные и
 * забыть про ивент не выйдет.
 *
 * Задание сдаётся не один раз: сдал — кулдаун двенадцать часов, отстоялся —
 * счётчик обнулился и идёт новый круг за новый кейс. Двенадцать часов выбраны
 * не случайно: это ровно половина суток, и утренний круг не мешает вечернему.
 *
 * Считает прогресс сайт, а не плагин: иначе разлогин посреди задания сбрасывал
 * бы счётчик, а два сервера считали бы каждый своё.
 */

export type QuestGoal = "BREAK" | "KILL" | "CRAFT" | "DELIVER";

export type Quest = {
  key: string;
  title: string;
  /** Зачем это в мире ивента — текст для витрины и меню в игре. */
  story: string;
  goal: QuestGoal;
  /** Что засчитывается: материалы блоков, типы мобов или предметы. */
  tokens: string[];
  target: number;
  rewardCase: string;
  /** С какого дня ивента задание открыто. Первый день — первый. */
  opensOnDay: number;
};

export const EVENT_KEY = "autumn_event";
/** Сколько дней идёт ивент. */
export const EVENT_DAYS = 14;
/** Сколько ждать между сдачами одного задания. */
export const COOLDOWN_HOURS = 12;

/**
 * Задания придуманы заранее и живут в коде, а не в базе: у каждого свой
 * список материалов, и настраивать это в панели значило бы дать администрации
 * способ сломать ивент опечаткой в названии блока.
 */
export const QUESTS: Quest[] = [
  {
    key: "harvest",
    title: "Сбор урожая",
    story:
      "Осень начинается с полей. Соберите то, что выросло за лето, пока дожди " +
      "не прибили колосья к земле.",
    goal: "BREAK",
    tokens: ["WHEAT", "CARROTS", "POTATOES", "BEETROOTS", "PUMPKIN", "MELON"],
    target: 512,
    rewardCase: "wild",
    opensOnDay: 1,
  },
  {
    key: "larder",
    title: "Погреб на зиму",
    story:
      "Собранное надо ещё и сохранить. Наполните погреб готовой едой — зимой " +
      "сырая морковь мало кого согреет.",
    goal: "DELIVER",
    tokens: [
      "BREAD",
      "BAKED_POTATO",
      "COOKED_BEEF",
      "COOKED_PORKCHOP",
      "COOKED_CHICKEN",
      "COOKED_MUTTON",
      "PUMPKIN_PIE",
      "DRIED_KELP",
    ],
    target: 384,
    rewardCase: "zoo",
    opensOnDay: 3,
  },
  {
    key: "leaffall",
    title: "Листопад",
    story:
      "Лес сбрасывает листву, и кому-то придётся её разгрести. Две тысячи " +
      "листьев — примерно одна роща.",
    goal: "BREAK",
    tokens: [
      "OAK_LEAVES",
      "BIRCH_LEAVES",
      "SPRUCE_LEAVES",
      "JUNGLE_LEAVES",
      "ACACIA_LEAVES",
      "DARK_OAK_LEAVES",
      "CHERRY_LEAVES",
      "MANGROVE_LEAVES",
      "AZALEA_LEAVES",
      "FLOWERING_AZALEA_LEAVES",
    ],
    target: 2048,
    rewardCase: "daily",
    opensOnDay: 5,
  },
  {
    key: "nighthunt",
    title: "Ночная охота",
    story:
      "Ночи стали длиннее, и из темноты выходит больше гостей, чем хотелось бы. " +
      "Проредите их, пока они не дошли до деревень.",
    goal: "KILL",
    tokens: ["ZOMBIE", "SKELETON", "SPIDER", "CREEPER", "WITCH", "HUSK", "STRAY", "DROWNED"],
    target: 300,
    rewardCase: "legends",
    opensOnDay: 7,
  },
  {
    key: "lanterns",
    title: "Тыквенные фонари",
    story:
      "Тёмные вечера просят света. Вырежьте фонари и развесьте их по округе — " +
      "заодно и мобов у дома станет меньше.",
    goal: "CRAFT",
    tokens: ["JACK_O_LANTERN"],
    target: 128,
    rewardCase: "wild",
    opensOnDay: 9,
  },
  {
    key: "deepautumn",
    title: "Глубокая осень",
    story:
      "Когда наверху слякоть, работать уходят вниз. Нижний мир не знает осени, " +
      "но и гостей там не любят.",
    goal: "KILL",
    tokens: ["BLAZE", "WITHER_SKELETON", "PIGLIN", "HOGLIN", "MAGMA_CUBE", "GHAST", "ZOGLIN"],
    target: 200,
    rewardCase: "legends",
    opensOnDay: 11,
  },
  {
    key: "feast",
    title: "Пир урожая",
    story:
      "Ивент кончается общим столом. Сто двадцать восемь пирогов — это на весь " +
      "сервер, а не на вас одного.",
    goal: "DELIVER",
    tokens: ["PUMPKIN_PIE"],
    target: 128,
    rewardCase: "zoo",
    opensOnDay: 13,
  },
];

export function questByKey(key: string): Quest | undefined {
  return QUESTS.find((quest) => quest.key === key);
}

export type EventWindow = {
  enabled: boolean;
  /** Когда ивент начался. */
  startsAt: number | null;
  /** Когда закончится: начало плюс две недели. */
  endsAt: number | null;
  /** Какой это день ивента, считая с первого. Вне ивента — 0. */
  day: number;
};

function off(): EventWindow {
  return { enabled: false, startsAt: null, endsAt: null, day: 0 };
}

/**
 * Текущее окно ивента. Конец проверяем при чтении, а не заданием по
 * расписанию — как и у судной ночи: надеяться, что кто-то нажмёт кнопку в
 * нужную минуту, не стоит.
 */
export async function getEvent(now = Date.now()): Promise<EventWindow> {
  let setting;
  try {
    setting = await db.setting.findUnique({ where: { key: EVENT_KEY } });
  } catch {
    // База недоступна — ивента нет: лучше молчащая витрина, чем выданный по
    // ошибке кейс.
    return off();
  }
  if (!setting) return off();

  const value = setting.value as { startsAt?: number } | null;
  const startsAt = typeof value?.startsAt === "number" ? value.startsAt : null;
  if (startsAt === null) return off();

  const endsAt = startsAt + EVENT_DAYS * 86_400_000;
  if (now < startsAt || now >= endsAt) return { enabled: false, startsAt, endsAt, day: 0 };

  return {
    enabled: true,
    startsAt,
    endsAt,
    day: Math.floor((now - startsAt) / 86_400_000) + 1,
  };
}

export async function setEvent(options: { startsAt: number | null; adminId: string }) {
  const value = options.startsAt === null ? {} : { startsAt: options.startsAt };
  await db.setting.upsert({
    where: { key: EVENT_KEY },
    update: { value, updatedById: options.adminId },
    create: { key: EVENT_KEY, value, updatedById: options.adminId },
  });
  await audit({
    actorId: options.adminId,
    action: options.startsAt === null ? "event.stop" : "event.start",
    meta: { startsAt: options.startsAt },
  });
  return getEvent();
}

export type QuestState = {
  key: string;
  title: string;
  story: string;
  goal: QuestGoal;
  tokens: string[];
  target: number;
  rewardCase: string;
  opensOnDay: number;
  /** Открыто ли задание сейчас: ивент идёт и день наступил. */
  open: boolean;
  amount: number;
  rounds: number;
  /** Сколько секунд до конца кулдауна. 0 — можно копить дальше. */
  cooldownSec: number;
};

function cooldownLeft(claimedAt: Date | null, now: number): number {
  if (!claimedAt) return 0;
  const ready = claimedAt.getTime() + COOLDOWN_HOURS * 3_600_000;
  return ready <= now ? 0 : Math.ceil((ready - now) / 1000);
}

/** Состояние всех заданий игрока: витрина на сайте и меню в игре смотрят сюда. */
export async function questStates(userId: string | null, now = Date.now()): Promise<QuestState[]> {
  const event = await getEvent(now);
  const rows = userId
    ? await db.questProgress.findMany({ where: { userId } })
    : [];
  const byKey = new Map(rows.map((row) => [row.questKey, row]));

  return QUESTS.map((quest) => {
    const row = byKey.get(quest.key);
    return {
      ...quest,
      open: event.enabled && event.day >= quest.opensOnDay,
      amount: row?.amount ?? 0,
      rounds: row?.rounds ?? 0,
      cooldownSec: cooldownLeft(row?.claimedAt ?? null, now),
    };
  });
}

export type QuestAdvance = {
  key: string;
  amount: number;
  rounds: number;
  target: number;
  /** Круг закрылся этим засчитыванием — плагин скажет об этом игроку. */
  completed: boolean;
  /** Ключ выданного кейса, если круг закрыт. */
  rewardCase: string | null;
  cooldownSec: number;
};

/** Что плагин насчитал и присылает пачкой при сбросе счётчиков. */
export type QuestEntry = { quest: string; token: string; amount: number };

/**
 * Засчитывает одно попадание и, если круг закрылся, выдаёт билет на кейс.
 *
 * Плагин присылает не только число, но и что именно засчитано — блок, моба или
 * предмет. Список всё равно перепроверяется здесь: плагин видно всем, а запрос
 * к сайту подделать проще, чем кажется, и без проверки «сдать» тыквенный пирог
 * можно было бы одним словом «PUMPKIN_PIE» в теле запроса.
 */
export async function advanceQuest(options: {
  userId: string;
  questKey: string;
  token: string;
  amount: number;
  now?: number;
}): Promise<QuestAdvance | { error: string }> {
  const now = options.now ?? Date.now();
  const quest = questByKey(options.questKey);
  if (!quest) return { error: "unknown_quest" };
  if (!quest.tokens.includes(options.token)) return { error: "wrong_token" };

  const event = await getEvent(now);
  if (!event.enabled) return { error: "event_off" };
  if (event.day < quest.opensOnDay) return { error: "not_open" };

  const amount = Math.max(0, Math.trunc(options.amount));
  if (amount <= 0) return { error: "empty" };

  const row = await db.questProgress.findUnique({
    where: { userId_questKey: { userId: options.userId, questKey: quest.key } },
  });

  const cooldownSec = cooldownLeft(row?.claimedAt ?? null, now);
  if (cooldownSec > 0) {
    return {
      key: quest.key,
      amount: row?.amount ?? 0,
      rounds: row?.rounds ?? 0,
      target: quest.target,
      completed: false,
      rewardCase: null,
      cooldownSec,
    };
  }

  // Кулдаун кончился, а счётчик остался от прошлого круга — обнуляем здесь, а
  // не заданием по таймеру: задание могло простоять неделю, и будить ради
  // этого базу незачем.
  const base = row?.claimedAt ? 0 : (row?.amount ?? 0);
  const next = base + amount;
  const completed = next >= quest.target;

  const saved = await db.$transaction(async (tx) => {
    const progress = await tx.questProgress.upsert({
      where: { userId_questKey: { userId: options.userId, questKey: quest.key } },
      update: {
        amount: completed ? 0 : next,
        rounds: completed ? { increment: 1 } : undefined,
        claimedAt: completed ? new Date(now) : null,
      },
      create: {
        userId: options.userId,
        questKey: quest.key,
        amount: completed ? 0 : next,
        rounds: completed ? 1 : 0,
        claimedAt: completed ? new Date(now) : null,
      },
    });

    // Награда — билет на кейс: кейс игрок откроет сам, когда захочет, и увидит
    // прокрутку. Выдать содержимое сразу значило бы отобрать у награды половину.
    if (completed) {
      await tx.caseTicket.create({
        data: { userId: options.userId, caseKey: quest.rewardCase },
      });
    }
    return progress;
  });

  return {
    key: quest.key,
    amount: saved.amount,
    rounds: saved.rounds,
    target: quest.target,
    completed,
    rewardCase: completed ? quest.rewardCase : null,
    cooldownSec: completed ? COOLDOWN_HOURS * 3600 : 0,
  };
}

/**
 * Пачка с плагина. Записи применяются по очереди, а не суммой: круг может
 * закрыться на середине пачки, и остаток должен уйти уже в кулдаун, а не
 * добить второй кейс одним сломанным блоком.
 */
export async function flushQuests(options: {
  userId: string;
  entries: QuestEntry[];
  now?: number;
}): Promise<QuestAdvance[]> {
  const done: QuestAdvance[] = [];
  for (const entry of options.entries.slice(0, 64)) {
    const result = await advanceQuest({
      userId: options.userId,
      questKey: String(entry.quest ?? ""),
      token: String(entry.token ?? ""),
      amount: Number(entry.amount ?? 0),
      now: options.now,
    });
    if ("error" in result) continue;
    done.push(result);
  }
  return done;
}
