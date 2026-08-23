import { safeEqual } from "./auth";

/**
 * Плагин ходит в API с общим секретом. Секрет живёт только в переменных
 * окружения сайта и в config.yml плагина — в базе его нет.
 */
export function serverTokenValid(request: Request): boolean {
  const expected = process.env.MC_SERVER_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("x-server-token");
  if (!header) return false;
  return safeEqual(header, expected);
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
