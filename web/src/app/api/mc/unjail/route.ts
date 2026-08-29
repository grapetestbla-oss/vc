import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { canLift, liftJail } from "@/lib/punishments";

/** Досрочный выпуск из деморгана командой /unjail. Доступен с хелпера. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json()) as { targetLogin?: string; actorLogin?: string };
  if (!body.targetLogin) return Response.json({ error: "bad request" }, { status: 400 });

  const target = await db.user.findUnique({ where: { login: body.targetLogin } });
  if (!target) return Response.json({ error: "target_not_found" }, { status: 404 });

  const actor = body.actorLogin
    ? await db.user.findUnique({ where: { login: body.actorLogin } })
    : null;
  // Без актора команду прислала консоль сервера — у неё полные права.
  const actorLevel = actor?.adminLevel ?? 5;

  const denied = canLift(actorLevel, "JAIL");
  if (denied) return Response.json({ error: "forbidden", message: denied }, { status: 403 });

  const lifted = await liftJail({ userId: target.id, byUserId: actor?.id ?? null });
  if (!lifted) return Response.json({ error: "not_jailed" }, { status: 404 });

  return Response.json({ ok: true, punishment: { id: lifted.id, reason: lifted.reason } });
}
