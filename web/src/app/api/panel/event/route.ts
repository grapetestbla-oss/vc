import { requirePanel } from "@/lib/panel";
import { getEvent, setEvent } from "@/lib/quests";

/** Запуск и остановка осеннего ивента. Только чиф-администратор. */
export async function GET() {
  const admin = await requirePanel(5, "purge.toggle");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(await getEvent());
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "purge.toggle");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { enabled, startsAt } = (await request.json()) as {
    enabled?: boolean;
    startsAt?: string | null;
  };

  if (enabled !== true) {
    return Response.json({ ok: true, ...(await setEvent({ startsAt: null, adminId: admin.id })) });
  }

  // Пустое поле — «начать сейчас»: чаще всего ивент запускают в тот же момент,
  // когда открыли эту страницу, и заставлять вбивать текущее время незачем.
  let startsMs = Date.now();
  if (startsAt) {
    const parsed = Date.parse(startsAt);
    if (!Number.isFinite(parsed)) {
      return Response.json({ error: "Не разобрал время начала" }, { status: 400 });
    }
    startsMs = parsed;
  }

  return Response.json({ ok: true, ...(await setEvent({ startsAt: startsMs, adminId: admin.id })) });
}
