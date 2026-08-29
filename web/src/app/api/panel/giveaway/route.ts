import { requirePanel } from "@/lib/panel";
import { cancelGiveaway, createGiveaway, drawGiveaway, GiveawayError } from "@/lib/giveaways";

/** Управление розыгрышами. Только чиф-администратор. */
export async function POST(request: Request) {
  const admin = await requirePanel(5, "giveaways.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    action?: "create" | "draw" | "cancel";
    giveawayId?: string;
    title?: string;
    prize?: string;
    description?: string;
    requiredHours?: number;
    endsAt?: string | null;
  };

  try {
    if (body.action === "draw") {
      if (!body.giveawayId) return Response.json({ error: "giveawayId required" }, { status: 400 });
      const finished = await drawGiveaway({ giveawayId: body.giveawayId, adminId: admin.id });
      return Response.json({
        ok: true,
        winner: finished.winner?.login ?? null,
        participants: finished.drawnFrom,
      });
    }

    if (body.action === "cancel") {
      if (!body.giveawayId) return Response.json({ error: "giveawayId required" }, { status: 400 });
      await cancelGiveaway({ giveawayId: body.giveawayId, adminId: admin.id });
      return Response.json({ ok: true, status: "cancelled" });
    }

    const giveaway = await createGiveaway({
      adminId: admin.id,
      title: body.title ?? "",
      prize: body.prize ?? "",
      description: body.description ?? "",
      requiredHours: body.requiredHours ?? 15,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
    });
    return Response.json({ ok: true, giveawayId: giveaway.id });
  } catch (error) {
    if (error instanceof GiveawayError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
