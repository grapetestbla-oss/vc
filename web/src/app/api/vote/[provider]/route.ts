import { clientIp } from "@/lib/audit";
import { isVoteProvider, readVoteRequest, rewardVote } from "@/lib/votes";

/**
 * Обратный вызов мониторинга: игрок проголосовал — начисляем VC.
 *
 * Адрес вида /api/vote/topminecrafter?key=...&nickname=... Мониторинги ходят
 * то GET, то POST, поэтому поддерживаем оба.
 */
async function handle(request: Request, provider: string) {
  if (!isVoteProvider(provider)) {
    return Response.json({ ok: false, error: "Неизвестный мониторинг" }, { status: 404 });
  }

  const vote = await readVoteRequest(request);
  const result = await rewardVote(provider, vote, clientIp(request));
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }

  return Response.json({
    ok: true,
    login: result.login,
    rewardVc: result.amountVc,
    balanceVc: result.balance,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handle(request, (await params).provider);
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handle(request, (await params).provider);
}
