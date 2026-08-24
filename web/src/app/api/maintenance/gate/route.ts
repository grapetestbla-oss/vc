import { currentUser } from "@/lib/session";
import { getMaintenance } from "@/lib/maintenance";

/**
 * Ответ для middleware: закрыт ли сайт для этого посетителя. Middleware живёт
 * на edge и в базу сходить не может, поэтому спрашивает здесь.
 */
export async function GET() {
  const maintenance = await getMaintenance();
  if (!maintenance.enabled) {
    return Response.json({ enabled: false, blocked: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const user = await currentUser();
  return Response.json(
    { enabled: true, blocked: (user?.adminLevel ?? 0) < 5 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
