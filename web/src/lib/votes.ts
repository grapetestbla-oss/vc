import { db } from "./db";
import { applyTransaction } from "./economy";

/**
 * Голоса за сервер в мониторинге top-minecrafter.
 *
 * У мониторинга нет обратного вызова — только выдача последних голосов по
 * ключу, поэтому мы их опрашиваем. Расписание берём от плагина: он и так ходит
 * на сайт по таймеру, и заводить ради этого cron на VPS незачем.
 *
 * Ключ и суммы лежат в настройках (как у касс), а не только в окружении: менять
 * их через передеплой сайта — лишняя работа.
 */

const KEY = "votes";
const PROVIDER = "topminecrafter";

export type VoteConfig = {
  enabled: boolean;
  apiUrl: string;
  serverId: string;
  key: string;
  /** Сколько VC за сам факт голоса. */
  rewardVc: number;
  /** Прибавка за каждый день серии сверх первого. */
  streakBonusVc: number;
  /**
   * Потолок дней серии, которые оплачиваются. Без него голосующий год подряд
   * получал бы тысячи VC за голос — а серия растёт сама, без усилий.
   */
  streakCap: number;
  /** Голоса старше этого возраста не оплачиваем: иначе первый же опрос после
   * подключения выдал бы награды задним числом за всё, что видно в выдаче. */
  maxAgeHours: number;
};

function number(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, Math.round(parsed));
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function voteDefaults(): VoteConfig {
  return {
    enabled: true,
    apiUrl: text(process.env.TOPMC_API_URL, "https://public-api.top-minecrafter.com"),
    serverId: text(process.env.TOPMC_SERVER_ID, ""),
    key: text(process.env.TOPMC_KEY, ""),
    rewardVc: number(process.env.VOTE_REWARD_VC, 200, 100000),
    streakBonusVc: number(process.env.VOTE_STREAK_BONUS_VC, 10, 10000),
    streakCap: number(process.env.VOTE_STREAK_CAP, 30, 3650),
    maxAgeHours: number(process.env.VOTE_MAX_AGE_HOURS, 48, 24 * 365),
  };
}

export async function getVoteConfig(): Promise<VoteConfig> {
  const base = voteDefaults();
  let stored: Partial<VoteConfig> | null = null;
  try {
    const setting = await db.setting.findUnique({ where: { key: KEY } });
    stored = (setting?.value ?? null) as Partial<VoteConfig> | null;
  } catch {
    return base;
  }
  if (!stored) return base;

  return {
    enabled: stored.enabled !== false,
    apiUrl: text(stored.apiUrl, base.apiUrl),
    serverId: text(stored.serverId, base.serverId),
    key: text(stored.key, base.key),
    rewardVc: number(stored.rewardVc, base.rewardVc, 100000),
    streakBonusVc: number(stored.streakBonusVc, base.streakBonusVc, 10000),
    streakCap: number(stored.streakCap, base.streakCap, 3650),
    maxAgeHours: number(stored.maxAgeHours, base.maxAgeHours, 24 * 365),
  };
}

export async function saveVoteConfig(patch: Partial<VoteConfig>): Promise<VoteConfig> {
  const current = await getVoteConfig();
  const merged: VoteConfig = {
    enabled: patch.enabled !== undefined ? patch.enabled !== false : current.enabled,
    apiUrl: text(patch.apiUrl, current.apiUrl),
    serverId: text(patch.serverId, current.serverId),
    key: text(patch.key, current.key),
    rewardVc: number(patch.rewardVc, current.rewardVc, 100000),
    streakBonusVc: number(patch.streakBonusVc, current.streakBonusVc, 10000),
    streakCap: number(patch.streakCap, current.streakCap, 3650),
    maxAgeHours: number(patch.maxAgeHours, current.maxAgeHours, 24 * 365),
  };
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: merged as never },
    update: { value: merged as never },
  });
  return merged;
}

/** Награда за голос: база плюс за каждый день серии сверх первого. */
export function voteAmount(config: VoteConfig, streak: number): number {
  const days = Math.min(Math.max(Math.floor(streak) - 1, 0), config.streakCap);
  return config.rewardVc + days * config.streakBonusVc;
}

export type Vote = { nickname: string; votedAt: Date; streak: number };

/** Разбор ответа мониторинга. Чужой формат — значит пустой список, а не падение. */
export function parseVotes(body: unknown): Vote[] {
  const result = (body as { result?: { votes?: unknown } } | null)?.result;
  if (!result || !Array.isArray(result.votes)) return [];

  const votes: Vote[] = [];
  for (const raw of result.votes) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const nickname = text(item.nickname, "");
    const votedAt = new Date(String(item.voted_at ?? ""));
    if (!nickname || Number.isNaN(votedAt.getTime())) continue;
    votes.push({ nickname, votedAt, streak: number(item.streak, 1, 3650) });
  }
  return votes;
}

async function fetchVotes(config: VoteConfig): Promise<Vote[]> {
  const url = new URL(`/v1/servers/${config.serverId}/votes`, config.apiUrl);
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "50");
  url.searchParams.set("key", config.key);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`мониторинг ответил ${response.status}`);
  return parseVotes(await response.json());
}

/** Игрока ищем и без учёта регистра: на сайте мониторинга ник пишут как придётся. */
async function findPlayer(nickname: string) {
  const exact = await db.user.findUnique({
    where: { login: nickname },
    select: { id: true, login: true },
  });
  if (exact) return exact;
  return db.user.findFirst({
    where: { login: { equals: nickname, mode: "insensitive" } },
    select: { id: true, login: true },
  });
}

export type SyncResult = {
  ok: boolean;
  reason?: string;
  checked: number;
  rewarded: { login: string; amountVc: number; streak: number }[];
};

/** Забирает свежие голоса и начисляет за них VC. Повторы отсекает база. */
export async function syncVotes(): Promise<SyncResult> {
  const config = await getVoteConfig();
  if (!config.enabled) return { ok: false, reason: "выключено", checked: 0, rewarded: [] };
  if (!config.key || !config.serverId) {
    return { ok: false, reason: "не настроено", checked: 0, rewarded: [] };
  }

  const votes = await fetchVotes(config);
  const oldest = Date.now() - config.maxAgeHours * 3600_000;
  const rewarded: SyncResult["rewarded"] = [];

  for (const vote of votes) {
    if (vote.votedAt.getTime() < oldest) continue;

    // Своего идентификатора у голоса нет, но ник и время вместе уникальны:
    // проголосовать дважды в одну секунду нельзя.
    const externalId = `${vote.nickname}:${vote.votedAt.toISOString()}`;
    const player = await findPlayer(vote.nickname);
    if (!player) continue;

    const amountVc = voteAmount(config, vote.streak);
    try {
      await db.voteReward.create({
        data: {
          userId: player.id,
          provider: PROVIDER,
          externalId,
          amountVc,
          streak: vote.streak,
        },
      });
    } catch {
      // Уникальный индекс сказал, что этот голос уже оплачен.
      continue;
    }

    await applyTransaction({
      userId: player.id,
      type: "BONUS",
      amount: amountVc,
      meta: { reason: "vote", provider: PROVIDER, streak: vote.streak },
    });
    await db.serverAction.create({
      data: {
        kind: "VOTE_REWARD",
        login: player.login,
        userId: player.id,
        payload: { amountVc, streak: vote.streak } as never,
      },
    });
    rewarded.push({ login: player.login, amountVc, streak: vote.streak });
  }

  return { ok: true, checked: votes.length, rewarded };
}
