import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { purchasesFor } from "@/lib/shop";

/** Что игрок купил в магазине — плагин по этому списку включает команды. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const login = new URL(request.url).searchParams.get("login");
  if (!login) return Response.json({ error: "login required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) return Response.json({ error: "not found" }, { status: 404 });

  const purchases = await purchasesFor(user.id);
  return Response.json({
    items: purchases.map((purchase) => ({
      key: purchase.itemKey,
      feature: (purchase.item.payload as { feature?: string } | null)?.feature ?? purchase.itemKey,
      title: purchase.item.title,
      permanent: purchase.permanent,
      chargesLeft: purchase.chargesLeft,
      payload: purchase.item.payload,
      data: purchase.data,
    })),
  });
}
