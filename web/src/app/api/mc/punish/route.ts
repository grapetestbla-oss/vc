import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { canPunish, expirePunishments, issueBan, issueJail, issueWarn } from "@/lib/punishments";

/** Выдача наказания из игры: /ajail, /warn, /ban. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json()) as {
    type?: "JAIL" | "WARN" | "BAN";
    targetLogin?: string;
    actorLogin?: string;
    reason?: string;
    minutes?: number;
    days?: number;
  };
  if (!body.type || !body.targetLogin || !body.reason) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  await expirePunishments();

  const target = await db.user.findUnique({ where: { login: body.targetLogin } });
  if (!target) return Response.json({ error: "target_not_found" }, { status: 404 });

  const actor = body.actorLogin
    ? await db.user.findUnique({ where: { login: body.actorLogin } })
    : null;
  const actorLevel = actor?.adminLevel ?? 5; // без актора — консоль сервера

  const denied = canPunish(actorLevel, body.type, body.minutes);
  if (denied) return Response.json({ error: "forbidden", message: denied }, { status: 403 });

  // Своих не трогаем: админ не может наказать равного или старшего по уровню.
  if (actor && target.adminLevel >= actor.adminLevel && target.id !== actor.id) {
    return Response.json({ error: "forbidden", message: "Цель того же уровня или выше" }, { status: 403 });
  }

  if (body.type === "JAIL") {
    const minutes = Math.max(1, Math.floor(body.minutes ?? 0));
    const existing = await db.punishment.findFirst({
      where: { userId: target.id, type: "JAIL", active: true },
    });
    if (existing) return Response.json({ error: "already_jailed" }, { status: 409 });
    const jail = await issueJail({
      userId: target.id,
      byUserId: actor?.id ?? null,
      reason: body.reason,
      minutes,
    });
    return Response.json({ ok: true, punishment: jail });
  }

  if (body.type === "WARN") {
    const result = await issueWarn({
      userId: target.id,
      byUserId: actor?.id ?? null,
      reason: body.reason,
    });
    return Response.json({ ok: true, warn: result.warn, autoBan: result.ban });
  }

  const days = Math.max(1, Math.floor(body.days ?? 1));
  const ban = await issueBan({
    userId: target.id,
    byUserId: actor?.id ?? null,
    reason: body.reason,
    days,
  });
  return Response.json({ ok: true, punishment: ban });
}
