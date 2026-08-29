import { getMaintenance } from "@/lib/maintenance";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import { translator } from "@/lib/i18n.server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Технические работы — VanillaCraft" };

export default async function MaintenancePage() {
  const t = await translator();
  const maintenance = await getMaintenance();

  return (
    <MaintenanceScreen
      reason={
        maintenance.enabled
          ? maintenance.reason
          : t("Работы завершены — обновите страницу, сайт снова открыт.")
      }
    />
  );
}
