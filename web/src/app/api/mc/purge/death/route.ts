import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { chargeDeath } from "@/lib/purge";

/**
 * Смерть в судную ночь. Плагин только сообщает, кто кого убил: сколько VC
 * снять и кому отдать, решает сайт — у него баланс и право его менять.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, killer } = (await request.json()) as { login?: string; killer?: string | null };
  if (!login) return Response.json({ error: "login required" }, { status: 400 });

  const loss = await chargeDeath(login, killer ?? null);
  if (!loss) return Response.json({ status: "skipped" });
  return Response.json({ status: "ok", ...loss });
}
