import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const admin = await requireAdmin(3);
  if (!admin) return null;
  await audit({ actorId: admin.id, action: "admin.dashboard.view" });

  const dayAgo = new Date(Date.now() - 86_400_000);
  const [users, newUsers, online, punishments, flags, reports, topups, wagered] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gt: dayAgo } } }),
    db.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 300_000) } } }),
    db.punishment.count({ where: { active: true } }),
    db.suspiciousFlag.count({ where: { resolved: false } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.payment.aggregate({
      where: { status: "paid", paidAt: { gt: dayAgo } },
      _sum: { amountRub: true },
    }),
    db.gameRound.aggregate({ where: { createdAt: { gt: dayAgo } }, _sum: { betVc: true } }),
  ]);

  const cards = [
    { label: "Аккаунтов", value: users },
    { label: "Регистраций за сутки", value: newUsers },
    { label: "Онлайн (5 мин)", value: online },
    { label: "Активных наказаний", value: punishments },
    { label: "Открытых репортов", value: reports },
    { label: "Срабатываний", value: flags },
    { label: "Выручка за сутки, ₽", value: topups._sum.amountRub ?? 0 },
    { label: "Ставок за сутки, VC", value: wagered._sum.betVc ?? 0 },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="panel p-5">
          <div className="muted text-sm">{card.label}</div>
          <div className="mt-1 text-2xl font-bold">{card.value}</div>
        </div>
      ))}
    </div>
  );
}
