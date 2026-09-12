import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { reportXray } from "@/lib/xray";

/** Игрок выкопал ловушечную руду: заводим сработку и будим администрацию. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json()) as {
    login?: string;
    ore?: string;
    world?: string;
    x?: number;
    y?: number;
    z?: number;
    hits?: number;
    brokenNearby?: number;
  };
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });

  const result = await reportXray({
    login: body.login,
    ore: String(body.ore ?? "?").slice(0, 40),
    world: String(body.world ?? "?").slice(0, 40),
    x: Math.trunc(body.x ?? 0),
    y: Math.trunc(body.y ?? 0),
    z: Math.trunc(body.z ?? 0),
    hits: Math.max(1, Math.trunc(body.hits ?? 1)),
    brokenNearby: Math.max(0, Math.trunc(body.brokenNearby ?? 0)),
  });
  if (!result) return Response.json({ status: "not_found" });
  return Response.json({ status: "ok", ...result });
}
