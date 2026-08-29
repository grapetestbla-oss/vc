import { requirePanel } from "@/lib/panel";
import { getMaintenance, setMaintenance } from "@/lib/maintenance";

/** Техработы включает и выключает только чиф-администратор. */
export async function GET() {
  const admin = await requirePanel(5, "maintenance.toggle");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(await getMaintenance());
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "maintenance.toggle");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { enabled, reason } = (await request.json()) as { enabled?: boolean; reason?: string };
  const state = await setMaintenance({
    enabled: enabled === true,
    reason: reason ?? "",
    adminId: admin.id,
  });
  return Response.json({ ok: true, ...state });
}
