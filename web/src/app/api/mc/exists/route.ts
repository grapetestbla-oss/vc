import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";

/**
 * Есть ли такой аккаунт на сайте. Плагин спрашивает при заходе, до пароля:
 * новичку сразу пишут, что нужна регистрация, а не «неверный пароль».
 */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const login = new URL(request.url).searchParams.get("login");
  if (!login) return Response.json({ error: "login required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  return Response.json({ registered: user !== null });
}
