import { requirePanel } from "@/lib/panel";
import { ShopError } from "@/lib/shop";
import {
  createShopItem,
  deleteShopItem,
  shopCatalogue,
  updateShopItem,
  type ShopItemInput,
} from "@/lib/shopadmin";

/** Каталог магазина правит только чиф-администратор: это цены и выручка. */
export async function GET() {
  const admin = await requirePanel(5, "shop.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ items: await shopCatalogue() });
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "shop.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    const item = await createShopItem((await request.json()) as ShopItemInput, admin.id);
    return Response.json({ ok: true, key: item.key });
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function PATCH(request: Request) {
  const admin = await requirePanel(5, "shop.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    const item = await updateShopItem((await request.json()) as ShopItemInput, admin.id);
    return Response.json({ ok: true, key: item.key });
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const admin = await requirePanel(5, "shop.manage");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { key } = (await request.json()) as { key?: string };
  try {
    await deleteShopItem((key ?? "").trim(), admin.id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
