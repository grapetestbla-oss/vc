import { createAppeal, AppealError } from "@/lib/appeals";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

/** Заявление о разбане. Без входа на сайт: забаненному он может быть недоступен. */
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`appeal:${ip ?? "unknown"}`, 3, 3600)) {
    return Response.json({ error: "Слишком много заявлений. Попробуйте через час." }, { status: 429 });
  }

  const body = (await request.json()) as { login?: string; contact?: string; text?: string };

  try {
    const appeal = await createAppeal({
      login: body.login ?? "",
      contact: body.contact ?? "",
      text: body.text ?? "",
      ip,
    });
    await audit({
      actorId: appeal.userId,
      action: "appeal.create",
      targetUserId: appeal.userId,
      ip,
      meta: { appealId: appeal.id, login: appeal.login },
    });
    return Response.json({ ok: true, appealId: appeal.id });
  } catch (error) {
    if (error instanceof AppealError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
