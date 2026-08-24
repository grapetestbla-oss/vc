import Link from "next/link";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit } from "@/lib/audit";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";

export const dynamic = "force-dynamic";

export default async function PanelHome() {
  const admin = await requirePanel(3);
  if (!admin) return null;
  await audit({ actorId: admin.id, action: "panel.dashboard.view" });

  const dayAgo = new Date(Date.now() - 86_400_000);
  const [
    users,
    newUsers,
    online,
    activePunishments,
    openReports,
    flags,
    pendingPayments,
    revenue,
    wagered,
    recentActions,
    recentPunishments,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gt: dayAgo } } }),
    db.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 300_000) } } }),
    db.punishment.count({ where: { active: true } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.suspiciousFlag.count({ where: { resolved: false } }),
    db.payment.count({ where: { status: "pending" } }),
    db.payment.aggregate({
      where: { status: "paid", paidAt: { gt: dayAgo } },
      _sum: { amountRub: true },
    }),
    db.gameRound.aggregate({ where: { createdAt: { gt: dayAgo } }, _sum: { betVc: true } }),
    db.auditLog.findMany({
      where: { actorId: { not: null }, action: { not: "panel.dashboard.view" } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { actor: { select: { login: true } }, target: { select: { login: true } } },
    }),
    db.punishment.findMany({
      orderBy: { issuedAt: "desc" },
      take: 10,
      include: {
        user: { select: { id: true, login: true } },
        by: { select: { login: true } },
      },
    }),
  ]);

  const cards = [
    { label: "Аккаунтов", value: users, href: "/panel/users" },
    { label: "Регистраций за сутки", value: newUsers, href: "/panel/users" },
    { label: "Онлайн (5 мин)", value: online, href: null },
    { label: "Активных наказаний", value: activePunishments, href: null },
    { label: "Открытых репортов", value: openReports, href: null },
    { label: "Срабатываний", value: flags, href: "/panel/flags", warn: flags > 0 },
    { label: "Выручка за сутки, ₽", value: revenue._sum.amountRub ?? 0, href: null },
    ...(admin.adminLevel >= 5
      ? [
          {
            label: "Заявок на пополнение",
            value: pendingPayments,
            href: "/panel/payments",
            warn: pendingPayments > 0,
          },
        ]
      : []),
    { label: "Ставок за сутки, VC", value: wagered._sum.betVc ?? 0, href: null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Сводка за сутки</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Обзор сервера</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => {
          const body = (
            <>
              <div className="eyebrow">{card.label}</div>
              <div
                className="mt-2 text-2xl font-semibold tabular-nums"
                style={card.warn ? { color: "var(--danger)" } : undefined}
              >
                <CountUp value={card.value} />
              </div>
            </>
          );
          return (
            <Reveal key={card.label} delay={index * 50}>
              {card.href ? (
                <Link href={card.href} className="panel panel-hover block h-full p-5">
                  {body}
                </Link>
              ) : (
                <div className="panel panel-hover h-full p-5">{body}</div>
              )}
            </Reveal>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel panel-hover p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Действия администрации</h2>
            <Link href="/panel/logs" className="muted text-sm underline">
              все логи
            </Link>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {recentActions.map((action) => (
              <li key={action.id} className="flex flex-wrap gap-2">
                <span className="muted">{action.createdAt.toLocaleTimeString("ru")}</span>
                <span>{action.actor?.login}</span>
                <span className="muted">{action.action}</span>
                {action.target && <span>→ {action.target.login}</span>}
              </li>
            ))}
            {recentActions.length === 0 && <li className="muted">Пока пусто</li>}
          </ul>
        </section>

        <section className="panel panel-hover p-6">
          <h2 className="font-semibold">Последние наказания</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {recentPunishments.map((punishment) => (
              <li key={punishment.id}>
                <span className={punishment.active ? "text-red-400" : "muted"}>{punishment.type}</span>{" "}
                <Link href={`/panel/users/${punishment.user.id}`} className="underline">
                  {punishment.user.login}
                </Link>
                <span className="muted">
                  {" "}
                  — {punishment.reason}
                  {punishment.by && ` · ${punishment.by.login}`}
                </span>
              </li>
            ))}
            {recentPunishments.length === 0 && <li className="muted">Никого не наказывали</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
