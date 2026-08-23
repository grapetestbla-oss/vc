import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit } from "@/lib/audit";
import { levelFromPlaytime } from "@/lib/levels";
import { accountsSharingIp } from "@/lib/antifraud";
import { ADMIN_LEVELS } from "@/lib/config";
import UserActions from "@/components/UserActions";

export const dynamic = "force-dynamic";

export default async function UserCard({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePanel(3);
  if (!admin) return null;
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      knownIps: { orderBy: { lastSeen: "desc" }, take: 20 },
      punishments: { orderBy: { issuedAt: "desc" }, take: 25, include: { by: { select: { login: true } } } },
      transactions: { orderBy: { createdAt: "desc" }, take: 25 },
      flags: { orderBy: { createdAt: "desc" }, take: 20 },
      loginAttempts: { orderBy: { createdAt: "desc" }, take: 25 },
      gameRounds: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) notFound();

  // Просмотр карточки — тоже действие администрации, оно пишется в журнал.
  await audit({ actorId: admin.id, action: "admin.user.view", targetUserId: user.id });

  const neighbours = user.lastIp ? await accountsSharingIp(user.lastIp, user.id) : [];
  // Почта и полный список IP видны с 4 уровня — рядовому админу они не нужны.
  const seesPrivateData = admin.adminLevel >= 4;

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">{user.login}</h1>
        <p className="muted mt-1 text-sm">
          Уровень {levelFromPlaytime(user.playtimeSec)} · {Math.floor(user.playtimeSec / 3600)} ч ·
          баланс {user.balanceVc} VC ·
          {user.adminLevel > 0 ? ` ${ADMIN_LEVELS[user.adminLevel]?.title}` : " игрок"}
        </p>
        {seesPrivateData && (
          <p className="muted mt-1 text-sm">
            {user.email} · регистрация {user.createdAt.toLocaleDateString("ru")} · последний IP {user.lastIp ?? "—"}
          </p>
        )}
        <UserActions userId={user.id} adminLevel={admin.adminLevel} />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-semibold">Наказания</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {user.punishments.map((p) => (
              <li key={p.id} className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <span className={p.active ? "text-red-400" : "muted"}>{p.type}</span> — {p.reason}
                <span className="muted">
                  {" "}
                  · {p.issuedAt.toLocaleString("ru")}
                  {p.by && ` · ${p.by.login}`}
                </span>
              </li>
            ))}
            {user.punishments.length === 0 && <li className="muted">Нет</li>}
          </ul>
        </section>

        <section className="panel p-6">
          <h2 className="font-semibold">Срабатывания</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {user.flags.map((f) => (
              <li key={f.id} className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <span className={f.severity >= 3 ? "text-red-400" : "text-yellow-400"}>{f.kind}</span>
                <span className="muted"> · {f.createdAt.toLocaleString("ru")}</span>
                <pre className="muted mt-1 overflow-x-auto text-xs">{JSON.stringify(f.details)}</pre>
              </li>
            ))}
            {user.flags.length === 0 && <li className="muted">Нет</li>}
          </ul>
        </section>

        {seesPrivateData && (
          <section className="panel p-6">
            <h2 className="font-semibold">Адреса</h2>
            <ul className="muted mt-3 space-y-1 text-sm">
              {user.knownIps.map((ip) => (
                <li key={ip.id}>
                  {ip.ip} · {ip.hits} входов · {ip.lastSeen.toLocaleDateString("ru")}
                </li>
              ))}
            </ul>
            {neighbours.length > 0 && (
              <p className="mt-3 text-sm text-yellow-400">
                С последнего адреса также заходят: {neighbours.map((n) => n.login).join(", ")}
              </p>
            )}
          </section>
        )}

        <section className="panel p-6">
          <h2 className="font-semibold">Операции</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {user.transactions.map((tx) => (
                <tr key={tx.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1">{tx.type}</td>
                  <td className={tx.amount < 0 ? "text-red-400" : "text-green-400"}>{tx.amount}</td>
                  <td className="muted text-right">{tx.createdAt.toLocaleString("ru")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-6">
          <h2 className="font-semibold">Входы</h2>
          <ul className="muted mt-3 space-y-1 text-sm">
            {user.loginAttempts.map((attempt) => (
              <li key={attempt.id}>
                {attempt.success ? "✓" : "✗"} {attempt.source} ·{" "}
                {seesPrivateData ? attempt.ip : "скрыт"} · {attempt.reason ?? "ok"} ·{" "}
                {attempt.createdAt.toLocaleString("ru")}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-6">
          <h2 className="font-semibold">Игры</h2>
          <ul className="muted mt-3 space-y-1 text-sm">
            {user.gameRounds.map((round) => (
              <li key={round.id}>
                {round.game} · ставка {round.betVc} · результат x{round.result} ·{" "}
                {round.won ? `+${round.payoutVc}` : `-${round.betVc}`}
              </li>
            ))}
            {user.gameRounds.length === 0 && <li>Не играл</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
