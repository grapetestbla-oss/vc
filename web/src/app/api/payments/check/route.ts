import { currentUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { syncPlategaPayments } from "@/lib/paymentsync";

/**
 * «Проверить оплату» со страницы пополнения. Игрок вернулся с кассы — незачем
 * заставлять его ждать уведомления, спросим статус сами.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Кнопку можно нажимать часто, а каждый вызов идёт в кассу.
  if (!rateLimit(`payment-check:${user.id}`, 10, 60)) {
    return Response.json({ error: "Подождите немного" }, { status: 429 });
  }

  const results = await syncPlategaPayments(user.id).catch(() => []);
  return Response.json({
    ok: true,
    checked: results.length,
    credited: results.filter((item) => item.credited).length,
  });
}
