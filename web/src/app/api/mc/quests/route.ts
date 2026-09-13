import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { flushQuests, getEvent, questStates, type QuestEntry } from "@/lib/quests";

/** Состояние заданий игрока: меню ивента в игре рисуется отсюда. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const login = new URL(request.url).searchParams.get("login") ?? "";
  const user = login
    ? await db.user.findUnique({ where: { login }, select: { id: true } })
    : null;

  return Response.json({
    event: await getEvent(),
    quests: await questStates(user?.id ?? null),
  });
}

/**
 * Пачка прогресса с плагина. Плагин копит счётчики у себя и сбрасывает их
 * раз в несколько секунд: на каждый сломанный лист по запросу к сайту — это
 * сотни запросов в минуту с одной рощи.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json()) as { login?: string; entries?: QuestEntry[] };
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });

  const user = await db.user.findUnique({
    where: { login: body.login },
    select: { id: true },
  });
  if (!user) return Response.json({ status: "not_found" });

  const advanced = await flushQuests({
    userId: user.id,
    entries: Array.isArray(body.entries) ? body.entries : [],
  });

  return Response.json({ status: "ok", advanced });
}
