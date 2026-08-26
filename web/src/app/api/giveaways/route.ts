import { currentUser } from "@/lib/session";
import { joinGiveaway, GiveawayError } from "@/lib/giveaways";

/** Участие в розыгрыше. Условие по часам проверяется здесь, а не в браузере. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { giveawayId } = (await request.json()) as { giveawayId?: string };
  if (!giveawayId) return Response.json({ error: "giveawayId required" }, { status: 400 });

  try {
    const giveaway = await joinGiveaway({ giveawayId, userId: user.id });
    return Response.json({ ok: true, title: giveaway.title });
  } catch (error) {
    if (error instanceof GiveawayError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
