import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { VideoBannerError, renderVideoBanner, videoBannerName } from "@/lib/videobanner";

/**
 * Видеобаннер с промокодом партнёра.
 *
 * Код берём из базы по владельцу промо, а не из запроса: иначе любой желающий
 * собирал бы ролики с чужими кодами и грузил бы этим сервер.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const promo = await db.promo.findFirst({
    where: { partnerId: user.id, active: true },
    select: { code: true },
  });
  if (!promo) return Response.json({ error: "У вас нет промокода партнёра" }, { status: 403 });

  // Сборка стоит секунд процессорного времени, поэтому частые повторы придержим.
  // Готовый ролик отдаётся из кэша и в этот счёт всё равно попадает: иначе
  // достаточно было бы жать кнопку в цикле.
  if (!rateLimit(`banner-video:${user.id}`, 10, 600)) {
    return Response.json({ error: "Слишком часто, попробуйте через минуту" }, { status: 429 });
  }

  try {
    const file = await renderVideoBanner(promo.code);
    const size = (await stat(file)).size;
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;

    return new Response(stream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${videoBannerName(promo.code)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof VideoBannerError) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
}
