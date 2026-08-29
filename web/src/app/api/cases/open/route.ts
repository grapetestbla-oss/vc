import { currentUser } from "@/lib/session";
import { CaseError, openCase, type OpenResult } from "@/lib/cases";
import { rateLimit } from "@/lib/ratelimit";
import { MAX_BULK_OPEN } from "@/lib/cases";

/** Сколько кейсов открывается за один раз. Роут не экспортирует константы —
 * Next разрешает в нём только обработчики, поэтому общее значение в lib. */

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`case:${user.id}`, 60, 60)) {
    return Response.json({ error: "Слишком быстро" }, { status: 429 });
  }

  const { caseKey, count } = (await request.json()) as { caseKey?: string; count?: number };
  if (!caseKey) return Response.json({ error: "caseKey required" }, { status: 400 });

  const times = Math.min(MAX_BULK_OPEN, Math.max(1, Math.floor(Number(count ?? 1)) || 1));

  const results: OpenResult[] = [];
  let stopped: string | null = null;

  // Открываем по одному: у каждого кейса своя ставка, свой сид и свой гарант.
  // Если посреди пачки кончились VC, отдаём то, что уже открылось, — деньги
  // за неоткрытые кейсы не списаны.
  for (let i = 0; i < times; i++) {
    try {
      results.push(await openCase(user.id, caseKey));
    } catch (error) {
      if (error instanceof CaseError) {
        if (results.length === 0) return Response.json({ error: error.message }, { status: 400 });
        stopped = error.message;
        break;
      }
      throw error;
    }
  }

  const last = results[results.length - 1];
  return Response.json({
    // Одиночное открытие отвечает как раньше: старый клиент читает поля напрямую.
    ...last,
    results,
    opened: results.length,
    requested: times,
    stopped,
  });
}
