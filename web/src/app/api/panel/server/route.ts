import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";
import {
  GamePanelError,
  POWER_SIGNALS,
  gamePanelConfigured,
  sendCommand,
  sendPower,
  serverStatus,
  type PowerSignal,
} from "@/lib/gamepanel";

/** Состояние игрового сервера. Только чиф-администратор. */
export async function GET() {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!gamePanelConfigured()) return Response.json({ configured: false });

  try {
    return Response.json({ configured: true, status: await serverStatus() });
  } catch (error) {
    if (error instanceof GamePanelError) {
      return Response.json({ configured: true, error: error.message }, { status: 502 });
    }
    throw error;
  }
}

/** Питание сервера и консольные команды. Каждое действие пишется в журнал. */
export async function POST(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { action, signal, command } = (await request.json()) as {
    action?: "power" | "command";
    signal?: string;
    command?: string;
  };

  try {
    if (action === "power") {
      if (!POWER_SIGNALS.includes(signal as PowerSignal)) {
        return Response.json({ error: "Неизвестный сигнал" }, { status: 400 });
      }
      await sendPower(signal as PowerSignal);
      await audit({
        actorId: admin.id,
        action: "admin.server.power",
        ip: clientIp(request),
        meta: { signal },
      });
      return Response.json({ ok: true });
    }

    if (action === "command") {
      const text = (command ?? "").trim();
      if (!text) return Response.json({ error: "Пустая команда" }, { status: 400 });
      if (text.length > 200) return Response.json({ error: "Слишком длинно" }, { status: 400 });
      await sendCommand(text);
      await audit({
        actorId: admin.id,
        action: "admin.server.command",
        ip: clientIp(request),
        meta: { command: text },
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    if (error instanceof GamePanelError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
