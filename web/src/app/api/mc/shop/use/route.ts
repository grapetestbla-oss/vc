import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { consumeCharge, ShopError } from "@/lib/shop";

/**
 * Списание одного использования. Считает сайт, а не плагин: перезаход или
 * два вызова подряд не должны давать лишний телепорт.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, key } = (await request.json()) as { login?: string; key?: string };
  if (!login || !key) return Response.json({ error: "login and key required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) return Response.json({ status: "not_found" });

  try {
    const { left } = await consumeCharge(user.id, key);
    return Response.json({ status: "ok", chargesLeft: left });
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ status: "denied", error: error.message });
    throw error;
  }
}
