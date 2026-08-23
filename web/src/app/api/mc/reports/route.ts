import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { audit } from "@/lib/audit";

/** Список открытых репортов для меню /reports. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const reports = await db.report.findMany({
    where: { status: { in: ["OPEN", "CLAIMED"] } },
    orderBy: { createdAt: "asc" },
    take: 45,
    include: {
      author: { select: { login: true } },
      claimedBy: { select: { login: true } },
    },
  });

  return Response.json({
    reports: reports.map((r) => ({
      id: r.id,
      text: r.text,
      author: r.author.login,
      status: r.status,
      claimedBy: r.claimedBy?.login ?? null,
      createdAt: r.createdAt,
    })),
  });
}

/** Взять репорт себе. Первый успевший забирает — остальным придёт already_claimed. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { id, actorLogin, close, resolution } = (await request.json()) as {
    id?: string;
    actorLogin?: string;
    close?: boolean;
    resolution?: string;
  };
  if (!id || !actorLogin) return Response.json({ error: "bad request" }, { status: 400 });

  const actor = await db.user.findUnique({ where: { login: actorLogin } });
  if (!actor || actor.adminLevel < 2) return Response.json({ error: "forbidden" }, { status: 403 });

  if (close) {
    const closed = await db.report.updateMany({
      where: { id, claimedById: actor.id, status: "CLAIMED" },
      data: { status: "CLOSED", closedAt: new Date(), resolution: resolution?.slice(0, 300) },
    });
    if (closed.count === 0) return Response.json({ error: "not_yours" }, { status: 409 });
    await audit({ actorId: actor.id, action: "report.close", meta: { id } });
    return Response.json({ ok: true });
  }

  // Атомарный захват: обновляем только пока статус ещё OPEN.
  const claimed = await db.report.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "CLAIMED", claimedById: actor.id, claimedAt: new Date() },
  });
  if (claimed.count === 0) return Response.json({ error: "already_claimed" }, { status: 409 });

  const report = await db.report.findUniqueOrThrow({
    where: { id },
    include: { author: { select: { login: true, lastIp: true } } },
  });
  await audit({ actorId: actor.id, action: "report.claim", targetUserId: report.authorId, meta: { id } });

  return Response.json({
    ok: true,
    report: { id: report.id, text: report.text, author: report.author.login },
  });
}
