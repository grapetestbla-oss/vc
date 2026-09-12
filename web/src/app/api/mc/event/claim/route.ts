import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { applyTransaction } from "@/lib/economy";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

/** Границы награды. Плагин доверенный, но подписанный им максимум мы проверяем сами. */
const LIMITS = {
  VC: { min: 1, max: 250 },
  SHARDS: { min: 1, max: 500 },
} as const;

/**
 * Игрок собрал искру сезона. Начисление идёт здесь: плагин сообщает находку,
 * но валюту создаёт только сайт — так одна искра не превратится в бесконечный
 * источник VC при пересборке плагина или подмене конфига.
 */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, kind, amount, sparkId } = (await request.json()) as {
    login?: string;
    kind?: "VC" | "SHARDS";
    amount?: number;
    sparkId?: string;
  };
  if (!login || !sparkId) return Response.json({ error: "login and sparkId required" }, { status: 400 });
  // SHARDS ещё присылают старые сборки плагина: осколков больше нет, такую
  // награду просто платим в VC по прежнему курсу обмена.
  if (kind !== "VC" && kind !== "SHARDS") {
    return Response.json({ error: "kind must be VC or SHARDS" }, { status: 400 });
  }

  const value = Math.floor(amount ?? 0);
  const limits = LIMITS[kind];
  if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
    return Response.json({ status: "denied", error: "Награда вне допустимых границ" });
  }

  const user = await db.user.findUnique({
    where: { login },
    select: { id: true, balanceVc: true },
  });
  if (!user) return Response.json({ status: "not_found" });

  // Потолок на игрока: даже если событие сойдёт с ума, экономика не поедет.
  if (!rateLimit(`spark:${user.id}`, 12, 3600)) {
    return Response.json({ status: "rate_limited" });
  }

  const reward = kind === "VC" ? value : Math.max(1, Math.round(value / 3));
  const balance = await applyTransaction({
    userId: user.id,
    type: "EVENT",
    amount: reward,
    meta: { event: "spark", sparkId, kind },
  });
  await audit({
    actorId: null,
    action: "event.spark.claim",
    targetUserId: user.id,
    meta: { kind, amount: reward, sparkId },
  });

  return Response.json({ status: "ok", balance });
}
