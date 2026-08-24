import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { saveState, ShopError } from "@/lib/shop";

/** Состояние товара: координаты дома, точка смерти и прочее. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, key, data } = (await request.json()) as {
    login?: string;
    key?: string;
    data?: unknown;
  };
  if (!login || !key) return Response.json({ error: "login and key required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) return Response.json({ status: "not_found" });

  try {
    await saveState(user.id, key, data ?? null);
    return Response.json({ status: "ok" });
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ status: "denied", error: error.message });
    throw error;
  }
}
