import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { BonusForm, PromoForm } from "@/components/CodeForms";

export const dynamic = "force-dynamic";

export default async function PromosPage() {
  const admin = await requirePanel(3);
  if (!admin) return null;

  const [promos, bonuses] = await Promise.all([
    db.promo.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        partner: { select: { login: true } },
        _count: { select: { activations: true } },
      },
    }),
    db.bonusCode.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <section className="panel space-y-4 p-6">
        <h1 className="font-semibold">Промокоды медиапартнёров</h1>
        {admin.adminLevel >= 5 ? (
          <PromoForm />
        ) : (
          <p className="muted text-sm">Создавать промокоды может только chief administrator.</p>
        )}
        <table className="w-full text-sm">
          <thead className="muted text-left">
            <tr>
              <th className="py-2">Код</th>
              <th>Партнёр</th>
              <th>Награда</th>
              <th>Уровень</th>
              <th>Активаций</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((promo) => (
              <tr key={promo.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 font-mono">{promo.code}</td>
                <td>{promo.partner?.login ?? "—"}</td>
                <td>{promo.rewardVc} VC</td>
                <td>{promo.requiredLevel}</td>
                <td>{promo._count.activations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel space-y-4 p-6">
        <h1 className="font-semibold">Бонус-коды</h1>
        {admin.adminLevel >= 5 ? (
          <BonusForm />
        ) : (
          <p className="muted text-sm">Создавать бонус-коды может только chief administrator.</p>
        )}
        <table className="w-full text-sm">
          <thead className="muted text-left">
            <tr>
              <th className="py-2">Код</th>
              <th>Награда</th>
              <th>Использовано</th>
              <th>Действует до</th>
            </tr>
          </thead>
          <tbody>
            {bonuses.map((bonus) => (
              <tr key={bonus.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 font-mono">{bonus.code}</td>
                <td>{bonus.rewardVc} VC</td>
                <td>
                  {bonus.usedCount} / {bonus.maxUses}
                </td>
                <td className="muted">{bonus.expiresAt?.toLocaleString("ru") ?? "бессрочно"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
