import { requirePanel } from "@/lib/panel";
import {
  createRank,
  deleteRank,
  listRanks,
  PERMISSIONS,
  RankError,
  updateRank,
} from "@/lib/ranks";
import { db } from "@/lib/db";

/** Ранги и права правит тот, у кого есть право «Ранги и права». */
export async function GET() {
  const admin = await requirePanel(5, "ranks.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const ranks = await listRanks();
  const holders = await db.user.groupBy({
    by: ["adminLevel"],
    where: { adminLevel: { gt: 0 } },
    _count: { _all: true },
  });
  const counts = new Map(holders.map((row) => [row.adminLevel, row._count._all]));

  return Response.json({
    permissions: PERMISSIONS,
    ranks: ranks.map((rank) => ({ ...rank, holders: counts.get(rank.level) ?? 0 })),
  });
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "ranks.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = (await request.json()) as Parameters<typeof createRank>[0];
    const rank = await createRank(body, admin.id);
    return Response.json({ ok: true, rank });
  } catch (error) {
    if (error instanceof RankError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function PATCH(request: Request) {
  const admin = await requirePanel(5, "ranks.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = (await request.json()) as Parameters<typeof updateRank>[0];
    // Свой ранг нельзя урезать по правам: администратор запер бы сам себя.
    if (body.level === admin.adminLevel && body.permissions) {
      const missing = ["panel.view", "ranks.manage"].filter(
        (key) => !body.permissions?.includes(key),
      );
      if (missing.length > 0) {
        return Response.json(
          { error: "У своего ранга нельзя снять вход в панель и правку рангов" },
          { status: 400 },
        );
      }
    }
    const rank = await updateRank(body, admin.id);
    return Response.json({ ok: true, rank });
  } catch (error) {
    if (error instanceof RankError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const admin = await requirePanel(5, "ranks.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { level } = (await request.json()) as { level?: number };
  if (typeof level !== "number") return Response.json({ error: "level required" }, { status: 400 });
  if (level === admin.adminLevel) {
    return Response.json({ error: "Свой ранг удалить нельзя" }, { status: 400 });
  }

  try {
    await deleteRank(level, admin.id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RankError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
