import { currentUser } from "@/lib/session";
import { buyHomeSlot } from "@/lib/homes";
import { ShopError } from "@/lib/shop";
import { audit, clientIp } from "@/lib/audit";

/** Докупка точки дома. Цена растёт с каждой купленной, поэтому её решает сервер. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { balance, price, total } = await buyHomeSlot(user.id);
    await audit({
      actorId: user.id,
      action: "shop.home-slot",
      ip: clientIp(request),
      meta: { priceVc: price, total },
    });
    return Response.json({ ok: true, balance, price, total });
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
