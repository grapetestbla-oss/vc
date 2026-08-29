import { requirePanel } from "@/lib/panel";
import { applyTransaction, InsufficientFunds } from "@/lib/economy";
import { audit, clientIp } from "@/lib/audit";

/** Ручная корректировка баланса. Только 5 уровень и только с причиной в журнале. */
export async function POST(request: Request) {
  const admin = await requirePanel(5, "users.balance");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { userId, amount, reason } = (await request.json()) as {
    userId?: string;
    amount?: number;
    reason?: string;
  };
  if (!userId || !amount || !reason?.trim()) {
    return Response.json({ error: "Нужны сумма и причина" }, { status: 400 });
  }

  try {
    const balance = await applyTransaction({
      userId,
      type: "ADMIN_ADJUST",
      amount: Math.trunc(amount),
      meta: { by: admin.login, reason },
    });
    await audit({
      actorId: admin.id,
      action: "admin.balance.adjust",
      targetUserId: userId,
      ip: clientIp(request),
      meta: { amount, reason },
    });
    return Response.json({ ok: true, balance });
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      return Response.json({ error: "Баланс уйдёт в минус" }, { status: 400 });
    }
    throw error;
  }
}
