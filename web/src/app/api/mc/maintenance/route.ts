import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { getMaintenance } from "@/lib/maintenance";

/** Плагин спрашивает, не идут ли техработы: если идут — кикает всех, кроме чифа. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();
  return Response.json(await getMaintenance(), { headers: { "Cache-Control": "no-store" } });
}
