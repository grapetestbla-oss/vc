import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { audit } from "@/lib/audit";

/** Плагин пишет сюда админ-действия из игры: /check, /esp, /tp, /asms, /news. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { actorLogin, action, targetLogin, meta } = (await request.json()) as {
    actorLogin?: string;
    action?: string;
    targetLogin?: string;
    meta?: Record<string, unknown>;
  };
  if (!action) return Response.json({ error: "action required" }, { status: 400 });

  const [actor, target] = await Promise.all([
    actorLogin ? db.user.findUnique({ where: { login: actorLogin }, select: { id: true } }) : null,
    targetLogin ? db.user.findUnique({ where: { login: targetLogin }, select: { id: true } }) : null,
  ]);

  await audit({
    actorId: actor?.id ?? null,
    action,
    targetUserId: target?.id ?? null,
    meta: (meta ?? {}) as Record<string, never>,
  });
  return Response.json({ ok: true });
}
