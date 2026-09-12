import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { GamePanelError, gamePanelConfigured, sendPower } from "@/lib/gamepanel";

/**
 * Ночной перезапуск. Команду отдаёт панель хостинга, а не сам сервер: своя
 * остановка гасит процесс насовсем — панель считает её штатной и обратно его
 * не поднимает. Игровой сервер только просит о перезапуске и, если попросить
 * не удалось, остаётся работать: невовремя не перезапустившийся сервер лучше
 * выключенного до утра.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();
  if (!gamePanelConfigured()) {
    return Response.json({ status: "not_configured" }, { status: 503 });
  }

  try {
    await sendPower("restart");
    return Response.json({ status: "ok" });
  } catch (error) {
    if (error instanceof GamePanelError) {
      return Response.json({ status: "failed", error: error.message }, { status: 502 });
    }
    throw error;
  }
}
