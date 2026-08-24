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
    select: { id: true, balanceVc: true, shards: true },
  });
  if (!user) return Response.json({ status: "not_found" });

  // Потолок на игрока: даже если событие сойдёт с ума, экономика не поедет.
  if (!rateLimit(`spark:${user.id}`, 12, 3600)) {
    return Response.json({ status: "rate_limited" });
  }

  if (kind === "VC") {
    const balance = await applyTransaction({
      userId: user.id,
      type: "EVENT",
      amount: value,
      meta: { event: "spark", sparkId },
    });
    await audit({
      actorId: null,
      action: "event.spark.claim",
      targetUserId: user.id,
      meta: { kind, amount: value, sparkId },
    });
    return Response.json({ status: "ok", balance, shards: user.shards });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { shards: { increment: value } },
    select: { shards: true, balanceVc: true },
  });
  await audit({
    actorId: null,
    action: "event.spark.claim",
    targetUserId: user.id,
    meta: { kind, amount: value, sparkId },
  });

  return Response.json({ status: "ok", shards: updated.shards, balance: updated.balanceVc });
}
