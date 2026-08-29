import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { getGameFlags } from "@/lib/gameflags";
import GameToggles from "@/components/GameToggles";

export const dynamic = "force-dynamic";

export default async function PanelGamesPage() {
  const admin = await requirePanel(5, "games.toggle");
  if (!admin) return null;

  const dayAgo = new Date(Date.now() - 86_400_000);
  const [flags, wagered, payout, rounds] = await Promise.all([
    getGameFlags(),
    db.gameRound.aggregate({ where: { createdAt: { gt: dayAgo } }, _sum: { betVc: true } }),
    db.gameRound.aggregate({ where: { createdAt: { gt: dayAgo } }, _sum: { payoutVc: true } }),
    db.gameRound.count({ where: { createdAt: { gt: dayAgo } } }),
  ]);

  const bets = wagered._sum.betVc ?? 0;
  const paid = payout._sum.payoutVc ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Мини-игры</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Здесь игры открываются и закрываются на ходу — например, на время техработ или пока
          выравнивается экономика.
        </p>
      </div>

      <section className="panel p-5 sm:p-6">
        <GameToggles flags={flags} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Ставок за сутки", value: `${bets.toLocaleString("ru")} VC` },
          { label: "Выплачено за сутки", value: `${paid.toLocaleString("ru")} VC` },
          {
            label: "Итог заведения",
            value: `${(bets - paid).toLocaleString("ru")} VC`,
            warn: paid > bets,
          },
        ].map((card) => (
          <div key={card.label} className="panel p-4">
            <div className="eyebrow">{card.label}</div>
            <div
              className="mt-2 text-xl font-semibold tabular-nums"
              style={card.warn ? { color: "var(--danger)" } : undefined}
            >
              {card.value}
            </div>
          </div>
        ))}
      </section>

      <p className="muted text-sm">Раундов за сутки: {rounds.toLocaleString("ru")}.</p>
    </div>
  );
}
