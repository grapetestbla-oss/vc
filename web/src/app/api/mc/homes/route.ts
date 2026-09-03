import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { deleteHome, homeCapacity, listHomes, saveHome } from "@/lib/homes";
import { ShopError } from "@/lib/shop";

async function userByLogin(login: string) {
  return db.user.findUnique({ where: { login }, select: { id: true } });
}

/** Список домов игрока и его вместимость — плагин набирает кэш при входе. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const login = new URL(request.url).searchParams.get("login");
  if (!login) return Response.json({ error: "login required" }, { status: 400 });

  const user = await userByLogin(login);
  if (!user) return Response.json({ status: "not_found" }, { status: 404 });

  const [homes, capacity] = await Promise.all([listHomes(user.id), homeCapacity(user.id)]);
  return Response.json({ status: "ok", homes, capacity });
}

/** Отметить или удалить точку дома. Хранит сайт: у него дома переживают вайп. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, action, name, location } = (await request.json()) as {
    login?: string;
    action?: string;
    name?: string;
    location?: string;
  };
  if (!login) return Response.json({ error: "login required" }, { status: 400 });

  const user = await userByLogin(login);
  if (!user) return Response.json({ status: "not_found" });

  try {
    if (action === "delete") {
      if (!name) return Response.json({ error: "name required" }, { status: 400 });
      await deleteHome(user.id, name);
    } else {
      if (!location) return Response.json({ error: "location required" }, { status: 400 });
      await saveHome(user.id, name ?? "", location);
    }
  } catch (error) {
    if (error instanceof ShopError) return Response.json({ status: "denied", error: error.message });
    throw error;
  }

  const [homes, capacity] = await Promise.all([listHomes(user.id), homeCapacity(user.id)]);
  return Response.json({ status: "ok", homes, capacity });
}
