import { requirePanel } from "@/lib/panel";
import { getMaintenance } from "@/lib/maintenance";
import MaintenanceToggle from "@/components/MaintenanceToggle";

export const dynamic = "force-dynamic";

export default async function PanelMaintenancePage() {
  const admin = await requirePanel(5, "maintenance.toggle");
  if (!admin) return null;

  const maintenance = await getMaintenance();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Технические работы</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Пока режим включён, все ниже 5 уровня видят на сайте заглушку, а игровой сервер никого
          не пускает и кикает тех, кто уже в сети. Панель, вход и API плагина продолжают работать —
          иначе выключить режим было бы нечем.
        </p>
      </div>

      <section className="panel p-5 sm:p-6">
        <MaintenanceToggle
          enabled={maintenance.enabled}
          reason={maintenance.reason}
          since={maintenance.since}
        />
      </section>
    </div>
  );
}
