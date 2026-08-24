import { currentUser } from "@/lib/session";
import { placeBet, LiveError } from "@/lib/live";
import { checkGameAnomaly } from "@/lib/antifraud";
import { db } from "@/lib/db";
import type { LiveGame } from "@prisma/client";

/** Ставка в текущий раунд общего стола. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { game, bet, target } = (await request.json()) as {
    game?: string;
    bet?: number;
    target?: number;
  };
  if (game !== "ROULETTE" && game !== "CRASH") {
    return Response.json({ error: "Неизвестная игра" }, { status: 400 });
  }

  try {
    const placed = await placeBet({
      game: game as LiveGame,
      userId: user.id,
      bet: bet ?? 0,
      target: target ?? 0,
    });
    await checkGameAnomaly(user.id);
    const fresh = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { balanceVc: true },
    });
    return Response.json({ ok: true, ...placed, balance: fresh.balanceVc });
  } catch (error) {
    if (error instanceof LiveError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
