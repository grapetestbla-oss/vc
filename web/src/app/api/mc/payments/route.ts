import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { syncPlategaPayments } from "@/lib/paymentsync";

/**
 * Досверка счетов по таймеру. Зовёт плагин — тот же приём, что и с голосами:
 * расписание у сервера уже есть, отдельный cron заводить незачем.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  try {
    const results = await syncPlategaPayments();
    return Response.json({
      ok: true,
      checked: results.length,
      credited: results.filter((item) => item.credited).length,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      reason: error instanceof Error ? error.message : "касса недоступна",
      checked: 0,
      credited: 0,
    });
  }
}
