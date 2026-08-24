import { currentUser } from "@/lib/session";
import { buyShopItem, ShopError } from "@/lib/shop";
import { audit, clientIp } from "@/lib/audit";

/** Покупка товара магазина за VC. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { key } = (await request.json()) as { key?: string };
  if (!key) return Response.json({ error: "key required" }, { status: 400 });

  try {
    const { balance, item } = await buyShopItem(user.id, key);
    await audit({
      actorId: user.id,
      action: "shop.buy",
      ip: clientIp(request),
      meta: { key, priceVc: item.priceVc },
    });
    return Response.json({ ok: true, balance, title: item.title });
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
