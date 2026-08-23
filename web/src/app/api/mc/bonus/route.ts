import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { applyTransaction } from "@/lib/economy";
import { rateLimit } from "@/lib/ratelimit";

/** /bonus <код> — бонус-код с лимитом использований и сроком действия. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, code } = (await request.json()) as { login?: string; code?: string };
  if (!login || !code) return Response.json({ error: "bad request" }, { status: 400 });
  if (!rateLimit(`bonus:${login}`, 8, 600)) {
    return Response.json({ status: "rate_limited" });
  }

  const user = await db.user.findUnique({ where: { login } });
  if (!user) return Response.json({ status: "no_account" });

  const bonus = await db.bonusCode.findUnique({ where: { code: code.toUpperCase() } });
  if (!bonus || !bonus.active) return Response.json({ status: "not_found" });
  if (bonus.expiresAt && bonus.expiresAt < new Date()) return Response.json({ status: "expired" });

  // Счётчик увеличиваем условием — так два одновременных ввода не пробьют лимит.
  const taken = await db.bonusCode.updateMany({
    where: { id: bonus.id, usedCount: { lt: bonus.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  if (taken.count === 0) return Response.json({ status: "exhausted" });

  try {
    await db.bonusUse.create({ data: { codeId: bonus.id, userId: user.id } });
  } catch {
    // Уже активировал — возвращаем счётчик назад.
    await db.bonusCode.update({ where: { id: bonus.id }, data: { usedCount: { decrement: 1 } } });
    return Response.json({ status: "already_used" });
  }

  const balance = await applyTransaction({
    userId: user.id,
    type: "BONUS",
    amount: bonus.rewardVc,
    meta: { code: bonus.code },
  });

  return Response.json({ status: "ok", reward: bonus.rewardVc, balance });
}
