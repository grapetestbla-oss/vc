import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { reportAnticheat } from "@/lib/cheat";

/**
 * Сработка стороннего античита. Плагин античита вызывает консольную команду
 * сервера, а она уже стучится сюда: так обвязка не привязана к конкретному
 * античиту и переживёт его замену.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json()) as {
    login?: string;
    check?: string;
    level?: number;
    raw?: string;
  };
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });

  const result = await reportAnticheat({
    login: body.login,
    check: String(body.check ?? "?").slice(0, 60),
    level: Math.max(0, Math.trunc(body.level ?? 1)),
    raw: String(body.raw ?? ""),
  });
  if (!result) return Response.json({ status: "not_found" });
  return Response.json({ status: "ok", ...result });
}
