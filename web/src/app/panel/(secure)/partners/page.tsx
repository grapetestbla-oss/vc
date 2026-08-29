import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import PartnerReview from "@/components/PartnerReview";
import { PLATFORM_LABEL, STATUS_LABEL } from "@/lib/partners";

export const dynamic = "force-dynamic";

export default async function PanelPartnersPage() {
  const admin = await requirePanel(3, "partners.review");
  if (!admin) return null;

  const [pending, decided] = await Promise.all([
    db.partnerApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { login: true } } },
    }),
    db.partnerApplication.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { reviewedAt: "desc" },
      take: 20,
      include: {
        user: { select: { login: true } },
        reviewer: { select: { login: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Сотрудничество</p>
        <h1 className="text-2xl font-bold tracking-tight">Заявки медиа-партнёров</h1>
        <p className="muted mt-1 text-sm">
          Одобрение выдаёт статус media и создаёт промокод партнёра. Решение принимают
          с 4 уровня.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="muted">Новых заявок нет.</p>
      ) : (
        <div className="space-y-4">
          {pending.map((application) => (
            <PartnerReview
              key={application.id}
              platformLabel={PLATFORM_LABEL[application.platform] ?? application.platform}
              application={{
                id: application.id,
                login: application.user.login,
                platform: application.platform,
                channelUrl: application.channelUrl,
                audience: application.audience,
                contact: application.contact,
                comment: application.comment,
                desiredCode: application.desiredCode,
                createdAt: application.createdAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}

      <section className="panel p-6">
        <h2 className="font-semibold">Рассмотренные</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {decided.map((application) => (
              <tr key={application.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2">{application.user.login}</td>
                <td className="muted">{PLATFORM_LABEL[application.platform]}</td>
                <td
                  style={{
                    color: application.status === "APPROVED" ? "var(--mint)" : "var(--danger)",
                  }}
                >
                  {STATUS_LABEL[application.status]}
                </td>
                <td className="muted">{application.reviewer?.login ?? "—"}</td>
                <td className="muted text-right text-xs">
                  {application.reviewedAt?.toLocaleString("ru") ?? ""}
                </td>
              </tr>
            ))}
            {decided.length === 0 && (
              <tr>
                <td className="muted py-2">Пока ничего не рассматривали</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
