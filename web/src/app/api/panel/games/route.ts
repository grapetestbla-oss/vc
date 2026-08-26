import { requirePanel } from "@/lib/panel";
import { getGameFlags, setGameFlag } from "@/lib/gameflags";
import type { LiveGame } from "@prisma/client";

/** Включение и выключение мини-игр. Только чиф-администратор. */
export async function GET() {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(await getGameFlags());
}

export async function POST(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { game, enabled } = (await request.json()) as { game?: string; enabled?: boolean };
  if (game !== "ROULETTE" && game !== "CRASH") {
    return Response.json({ error: "Неизвестная игра" }, { status: 400 });
  }

  const flags = await setGameFlag({
    game: game as LiveGame,
    enabled: enabled === true,
    adminId: admin.id,
  });
  return Response.json({ ok: true, ...flags });
}
