import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { startMatch, finishMatch, refundMatch, DiceError } from "@/lib/dice";

/**
 * Кости на сервере. Плагин сообщает о начале партии и о бросках, а деньги
 * двигает сайт: только он знает настоящие балансы.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json()) as {
    action?: "start" | "finish" | "refund";
    matchId?: string;
    challengerLogin?: string;
    opponentLogin?: string;
    amount?: number;
    challengerRoll?: number;
    opponentRoll?: number;
  };

  try {
    if (body.action === "finish") {
      if (!body.matchId) return Response.json({ error: "matchId required" }, { status: 400 });
      const result = await finishMatch({
        matchId: body.matchId,
        challengerRoll: body.challengerRoll ?? 0,
        opponentRoll: body.opponentRoll ?? 0,
      });
      return Response.json({ status: "ok", ...result });
    }

    if (body.action === "refund") {
      if (!body.matchId) return Response.json({ error: "matchId required" }, { status: 400 });
      await refundMatch(body.matchId);
      return Response.json({ status: "ok" });
    }

    const started = await startMatch({
      challengerLogin: body.challengerLogin ?? "",
      opponentLogin: body.opponentLogin ?? "",
      amount: body.amount ?? 0,
    });
    return Response.json({ status: "ok", ...started });
  } catch (error) {
    if (error instanceof DiceError) return Response.json({ status: "denied", error: error.message });
    throw error;
  }
}
