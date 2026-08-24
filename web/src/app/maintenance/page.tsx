import { getMaintenance } from "@/lib/maintenance";
import MaintenanceScreen from "@/components/MaintenanceScreen";

export const dynamic = "force-dynamic";

export const metadata = { title: "Технические работы — VanillaCraft" };

export default async function MaintenancePage() {
  const maintenance = await getMaintenance();

  return (
    <MaintenanceScreen
      reason={
        maintenance.enabled
          ? maintenance.reason
          : "Работы завершены — обновите страницу, сайт снова открыт."
      }
    />
  );
}
