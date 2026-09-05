import { requirePanel } from "@/lib/panel";
import { getPurge, setPurge } from "@/lib/purge";

/** Включение и выключение судной ночи. Только чиф-администратор. */
export async function GET() {
  const admin = await requirePanel(5, "purge.toggle");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(await getPurge());
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "purge.toggle");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { enabled, until } = (await request.json()) as { enabled?: boolean; until?: string | null };

  // Срок окончания разбираем здесь: строка из формы приходит в местном времени
  // администратора, а хранить нужно момент времени.
  let untilMs: number | null = null;
  if (enabled === true && until) {
    const parsed = Date.parse(until);
    if (!Number.isFinite(parsed)) {
      return Response.json({ error: "Не разобрал время окончания" }, { status: 400 });
    }
    if (parsed <= Date.now()) {
      return Response.json({ error: "Окончание уже прошло" }, { status: 400 });
    }
    untilMs = parsed;
  }

  const purge = await setPurge({ enabled: enabled === true, until: untilMs, adminId: admin.id });
  return Response.json({ ok: true, ...purge });
}
