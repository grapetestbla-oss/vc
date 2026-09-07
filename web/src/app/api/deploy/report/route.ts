import { db } from "@/lib/db";
import { agentTokenValid, finishRelease } from "@/lib/release";
import { GamePanelError, gamePanelConfigured, sendPower } from "@/lib/gamepanel";

/**
 * Отчёт агента о выкатке. Перезапуск игрового сервера делает сайт, а не агент:
 * ключ от панели хостинга лежит в переменных сайта, и размножать его по
 * скриптам на диске незачем.
 */
export async function POST(request: Request) {
  if (!agentTokenValid(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id, ok, log } = (await request.json()) as { id?: string; ok?: boolean; log?: string };
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const release = await finishRelease({ id, ok: ok === true, log: log ?? "" });
  if (!release) return Response.json({ status: "unknown" }, { status: 404 });

  let restarted: boolean | string = false;
  if (release.status === "DONE" && release.restartGame) {
    let line: string;
    if (!gamePanelConfigured()) {
      restarted = "панель хостинга не настроена";
      line = "Игровой сервер не перезапущен: панель хостинга не настроена.";
    } else {
      try {
        await sendPower("restart");
        restarted = true;
        line = "Игровой сервер перезапущен.";
      } catch (error) {
        // Сайт уже выкачен — неудачный перезапуск этого не отменяет, поэтому
        // выкатку не проваливаем, а дописываем причину в её журнал.
        restarted = error instanceof GamePanelError ? error.message : "не удалось";
        line = `Игровой сервер перезапустить не удалось: ${restarted}`;
      }
    }
    await db.release.update({
      where: { id: release.id },
      data: { log: `${release.log}\n${line}`.slice(-8000) },
    });
  }

  return Response.json({ status: release.status, restarted });
}
