import { currentUser } from "@/lib/session";
import { equipCosmetic } from "@/lib/cosmetics";

/** Надеть или снять предмет. Внутри одного вида активен только один. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { key, equipped } = (await request.json()) as { key?: string; equipped?: boolean };
  if (!key) return Response.json({ error: "key required" }, { status: 400 });

  const result = await equipCosmetic(user.id, key, equipped !== false);
  if (!result) return Response.json({ error: "У вас нет этого предмета" }, { status: 404 });

  return Response.json({ ok: true });
}
