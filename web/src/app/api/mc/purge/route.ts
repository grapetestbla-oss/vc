import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { getPurge } from "@/lib/purge";

/** Плагин спрашивает, идёт ли судная ночь: от этого зависит режим игры. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();
  return Response.json(await getPurge(), { headers: { "Cache-Control": "no-store" } });
}
