import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { syncVotes } from "@/lib/votes";

/**
 * Опрос мониторинга. Зовёт плагин по таймеру: он и так ходит на сайт, а cron на
 * VPS ради одного запроса заводить незачем.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  try {
    const result = await syncVotes();
    return Response.json(result);
  } catch (error) {
    // Мониторинг мог не ответить — это не повод отвечать плагину ошибкой,
    // иначе он будет писать в лог на каждой попытке.
    return Response.json({
      ok: false,
      reason: error instanceof Error ? error.message : "мониторинг недоступен",
      checked: 0,
      rewarded: [],
    });
  }
}
