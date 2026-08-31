import { requirePanel } from "@/lib/panel";
import { audit } from "@/lib/audit";
import { getVoteConfig, saveVoteConfig, syncVotes, type VoteConfig } from "@/lib/votes";

/** Ключ мониторинга виден только по маске: в панель заходят несколько человек. */
function masked(config: VoteConfig) {
  return {
    ...config,
    key: config.key ? `${config.key.slice(0, 4)}…${config.key.slice(-2)}` : "",
    hasKey: Boolean(config.key),
  };
}

export async function GET() {
  const admin = await requirePanel(5, "payments.providers");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ config: masked(await getVoteConfig()) });
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "payments.providers");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Partial<VoteConfig> & { sync?: boolean };

  // Кнопка «проверить сейчас»: настройки не трогаем, просто опрашиваем.
  if (body.sync) {
    const result = await syncVotes().catch((error: unknown) => ({
      ok: false,
      reason: error instanceof Error ? error.message : "мониторинг недоступен",
      checked: 0,
      rewarded: [],
    }));
    return Response.json(result);
  }

  const config = await saveVoteConfig(body);
  await audit({
    actorId: admin.id,
    action: "admin.votes.config",
    meta: { enabled: config.enabled, rewardVc: config.rewardVc, streakBonusVc: config.streakBonusVc },
  });
  return Response.json({ config: masked(config) });
}
