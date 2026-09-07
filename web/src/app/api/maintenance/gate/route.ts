import { currentUser } from "@/lib/session";
import { getMaintenance } from "@/lib/maintenance";
import { isStaging, stagingAllows } from "@/lib/staging";

/**
 * Ответ для middleware: закрыт ли сайт для этого посетителя. Middleware живёт
 * на edge и в базу сходить не может, поэтому спрашивает здесь.
 *
 * Отвечает сразу за две заслонки — техработы и технический сайт, — потому что
 * middleware не должен ради второй ходить вторым запросом на каждый переход.
 */
export async function GET() {
  const staging = isStaging();
  const maintenance = await getMaintenance();

  if (!staging && !maintenance.enabled) {
    return Response.json(
      { enabled: false, blocked: false, staging: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await currentUser();
  // На техническом сайте уровень админки ни при чём: список задаётся при
  // запуске контейнера, чтобы правка в базе не открыла чужим стенд.
  const stagingBlocked = staging && !stagingAllows(user?.login);
  const maintenanceBlocked = maintenance.enabled && (user?.adminLevel ?? 0) < 5;

  return Response.json(
    {
      enabled: maintenance.enabled,
      blocked: maintenanceBlocked,
      staging,
      stagingBlocked,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
