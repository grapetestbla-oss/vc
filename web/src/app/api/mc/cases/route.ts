import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { openPurchasedCase, pendingTickets, purchaseCaseTicket, CaseError } from "@/lib/cases";

/** Витрина кейсов и оплаченные, но не открытые кейсы игрока. */
export async function GET(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const login = new URL(request.url).searchParams.get("login");
  const cases = await db.caseType.findMany({
    where: { active: true, freeDaily: false },
    orderBy: { sortOrder: "asc" },
    select: { key: true, name: true, description: true, priceVc: true },
  });

  const user = login
    ? await db.user.findUnique({ where: { login }, select: { id: true, balanceVc: true } })
    : null;

  return Response.json({
    balance: user?.balanceVc ?? null,
    cases,
    tickets: user ? await pendingTickets(user.id) : [],
  });
}

/** Покупка кейса в игре и его открытие после установки блока. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { action, login, caseKey } = (await request.json()) as {
    action?: "buy" | "open";
    login?: string;
    caseKey?: string;
  };
  if (!login || !caseKey) return Response.json({ error: "login and caseKey required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) return Response.json({ status: "not_found" });

  try {
    if (action === "open") {
      const result = await openPurchasedCase(user.id, caseKey);
      return Response.json({
        status: "ok",
        kind: result.kind,
        amount: result.amount,
        duplicate: result.duplicate,
        cosmetic: result.cosmetic
          ? { name: result.cosmetic.name, rarity: result.cosmetic.rarity, kind: result.cosmetic.kind }
          : null,
        balance: result.balanceVc,
        shards: result.shards,
      });
    }

    const bought = await purchaseCaseTicket(user.id, caseKey);
    return Response.json({
      status: "ok",
      balance: bought.balance,
      name: bought.caseType.name,
      priceVc: bought.caseType.priceVc,
    });
  } catch (error) {
    if (error instanceof CaseError) return Response.json({ status: "denied", error: error.message });
    throw error;
  }
}
