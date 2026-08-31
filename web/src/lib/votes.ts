import { db } from "./db";
import { applyTransaction } from "./economy";

/**
 * Награда за голос в мониторинге.
 *
 * Мониторинги зовут наш адрес по-разному: кто-то GET со строкой запроса, кто-то
 * POST с JSON или формой, и поля называются кто во что горазд. Поэтому разбор
 * намеренно терпимый — ник ищем среди привычных имён полей, ключ принимаем и в
 * запросе, и в заголовке. Что нельзя ослаблять, так это проверку ключа: без неё
 * начислять VC мог бы кто угодно.
 */

export const VOTE_PROVIDERS = ["topminecrafter"] as const;
export type VoteProvider = (typeof VOTE_PROVIDERS)[number];

export function isVoteProvider(value: string): value is VoteProvider {
  return (VOTE_PROVIDERS as readonly string[]).includes(value);
}

export function voteSecret(provider: VoteProvider): string | null {
  const key = `VOTE_SECRET_${provider.toUpperCase()}`;
  return process.env[key]?.trim() || process.env.VOTE_SECRET?.trim() || null;
}

export function voteReward(): number {
  const raw = Number.parseInt(process.env.VOTE_REWARD_VC ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 200;
}

/** Сколько часов между наградами за голоса одного игрока. */
export const VOTE_COOLDOWN_HOURS = 12;

const NICK_FIELDS = ["nickname", "nick", "username", "player", "login", "name"];
const KEY_FIELDS = ["key", "secret", "token", "hash", "sign", "signature"];
const ID_FIELDS = ["id", "vote_id", "voteId", "transaction", "transaction_id"];

function pick(source: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export type VoteRequest = { nickname: string | null; key: string | null; externalId: string | null };

export async function readVoteRequest(request: Request): Promise<VoteRequest> {
  const url = new URL(request.url);
  const source: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());

  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = await request.json().catch(() => null);
      if (body && typeof body === "object") Object.assign(source, body);
    } else {
      const form = await request.formData().catch(() => null);
      if (form) for (const [field, value] of form.entries()) source[field] = String(value);
    }
  }

  return {
    nickname: pick(source, NICK_FIELDS),
    key: pick(source, KEY_FIELDS) ?? request.headers.get("x-api-key"),
    externalId: pick(source, ID_FIELDS),
  };
}

export type VoteOutcome =
  | { ok: true; login: string; amountVc: number; balance: number }
  | { ok: false; status: number; error: string };

export async function rewardVote(
  provider: VoteProvider,
  vote: VoteRequest,
  ip: string | null,
): Promise<VoteOutcome> {
  const secret = voteSecret(provider);
  if (!secret) return { ok: false, status: 503, error: "Приём голосов не настроен" };
  if (!vote.key || vote.key !== secret) return { ok: false, status: 403, error: "Неверный ключ" };
  if (!vote.nickname) return { ok: false, status: 400, error: "Не передан ник" };

  const user = await db.user.findUnique({
    where: { login: vote.nickname },
    select: { id: true, login: true },
  });
  if (!user) return { ok: false, status: 404, error: "Игрок не найден" };

  // Мониторинг может повторить запрос при сбое — по id голоса это видно точно.
  if (vote.externalId) {
    const seen = await db.voteReward.findUnique({
      where: { provider_externalId: { provider, externalId: vote.externalId } },
    });
    if (seen) return { ok: false, status: 409, error: "Этот голос уже засчитан" };
  }

  const since = new Date(Date.now() - VOTE_COOLDOWN_HOURS * 3600_000);
  const recent = await db.voteReward.findFirst({
    where: { userId: user.id, provider, createdAt: { gt: since } },
    select: { id: true },
  });
  if (recent) return { ok: false, status: 429, error: "Награда за голос уже получена" };

  const amountVc = voteReward();
  await db.voteReward.create({
    data: { userId: user.id, provider, externalId: vote.externalId, amountVc, ip },
  });
  const balance = await applyTransaction({
    userId: user.id,
    type: "BONUS",
    amount: amountVc,
    meta: { reason: "vote", provider },
  });

  return { ok: true, login: user.login, amountVc, balance };
}
