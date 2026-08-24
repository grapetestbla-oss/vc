import { currentUser } from "@/lib/session";
import { tableState } from "@/lib/live";
import type { LiveGame } from "@prisma/client";

/** Состояние стола. Опрашивается клиентом раз в секунду, поэтому без кэша. */
export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get("game");
  if (game !== "ROULETTE" && game !== "CRASH") {
    return Response.json({ error: "Неизвестная игра" }, { status: 400 });
  }

  const user = await currentUser();
  const state = await tableState(game as LiveGame, user?.id ?? null);

  return Response.json({ ...state, balance: user?.balanceVc ?? null }, {
    headers: { "Cache-Control": "no-store" },
  });
}
