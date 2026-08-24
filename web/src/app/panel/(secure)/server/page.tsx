import { requirePanel } from "@/lib/panel";
import { gamePanelConfigured } from "@/lib/gamepanel";
import ServerControl from "@/components/ServerControl";

export const dynamic = "force-dynamic";

export default async function PanelServerPage() {
  const admin = await requirePanel(5);
  if (!admin) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Управление сервером</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Питание и консоль игрового сервера через панель хостинга. Состояние обновляется каждые
          10 секунд, каждое действие попадает в журнал.
        </p>
      </div>

      <ServerControl configured={gamePanelConfigured()} />
    </div>
  );
}
