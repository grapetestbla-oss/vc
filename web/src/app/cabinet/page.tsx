import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { levelFromPlaytime, nextLevelAt } from "@/lib/levels";
import { ADMIN_LEVELS } from "@/lib/config";
import TwoFactorCode from "@/components/TwoFactorCode";

export const dynamic = "force-dynamic";

export default async function CabinetPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [transactions, punishments, promo, rounds] = await Promise.all([
    db.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    db.punishment.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: "desc" },
      take: 10,
      include: { by: { select: { login: true } } },
    }),
    db.promo.findFirst({
      where: { partnerId: user.id },
      include: { activations: { select: { createdAt: true, user: { select: { login: true } } } } },
    }),
    db.gameRound.findMany({ where: { userId: user.id }, select: { betVc: true, payoutVc: true } }),
  ]);

  const level = levelFromPlaytime(user.playtimeSec);
  const hours = Math.floor(user.playtimeSec / 3600);
  const wagered = rounds.reduce((sum, r) => sum + r.betVc, 0);
  const net = rounds.reduce((sum, r) => sum + r.payoutVc - r.betVc, 0);

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <h1 className="text-2xl font-bold">{user.login}</h1>
            <p className="muted text-sm">
              Уровень {level} · {hours} ч в игре
              {user.adminLevel > 0 && ` · ${ADMIN_LEVELS[user.adminLevel]?.title}`}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-bold" style={{ color: "var(--gold)" }}>
              {user.balanceVc} VC
            </div>
            <Link href="/topup" className="muted text-sm underline">
              пополнить
            </Link>
          </div>
        </div>
        <p className="muted mt-4 text-sm">
          До уровня {level + 1}: ещё {Math.max(0, Math.ceil((nextLevelAt(level) - user.playtimeSec) / 3600))} ч
        </p>
      </section>

      <section className="panel space-y-3 p-6">
        <h2 className="font-semibold">Вход в игру</h2>
        <p className="muted text-sm">
          Заходите на сервер под ником {user.login} и введите /login с этим же паролем.
          Если вход с нового адреса — сервер попросит код 2FA.
        </p>
        <TwoFactorCode />
      </section>

      {promo && (
        <section className="panel p-6">
          <h2 className="font-semibold">Ваш промокод: {promo.code}</h2>
          <p className="muted mt-1 text-sm">
            Активаций: {promo.activations.length} · награда игроку {promo.rewardVc} VC ·
            требуется уровень {promo.requiredLevel}
          </p>
          <ul className="muted mt-3 space-y-1 text-sm">
            {promo.activations.slice(0, 10).map((a) => (
              <li key={`${a.user.login}-${a.createdAt.toISOString()}`}>
                {a.user.login} — {a.createdAt.toLocaleDateString("ru")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-semibold">Операции</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2">{tx.type}</td>
                  <td className={tx.amount < 0 ? "text-red-400" : "text-green-400"}>
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount}
                  </td>
                  <td className="muted text-right">{tx.createdAt.toLocaleString("ru")}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td className="muted py-2">Пока пусто</td>
                </tr>
              )}
            </tbody>
          </table>
          {wagered > 0 && (
            <p className="muted mt-3 text-sm">
              В играх поставлено {wagered} VC, итог {net > 0 ? "+" : ""}
              {net} VC
            </p>
          )}
        </section>

        <section className="panel p-6">
          <h2 className="font-semibold">Наказания</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {punishments.map((p) => (
              <li key={p.id} className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <span className={p.active ? "text-red-400" : "muted"}>{p.type}</span> — {p.reason}
                <span className="muted"> · {p.issuedAt.toLocaleDateString("ru")}</span>
                {p.by && <span className="muted"> · выдал {p.by.login}</span>}
              </li>
            ))}
            {punishments.length === 0 && <li className="muted">Чисто</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
