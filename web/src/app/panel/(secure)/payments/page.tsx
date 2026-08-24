import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { CONFIG } from "@/lib/config";
import PaymentReview from "@/components/PaymentReview";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "На рассмотрении",
  paid: "Начислено",
  rejected: "Отклонено",
};

export default async function PanelPaymentsPage() {
  const admin = await requirePanel(5);
  if (!admin) return null;

  const [pending, history, paidToday] = await Promise.all([
    db.payment.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { login: true, balanceVc: true } } },
    }),
    db.payment.findMany({
      where: { status: { not: "pending" } },
      orderBy: { reviewedAt: "desc" },
      take: 25,
      include: {
        user: { select: { login: true } },
        reviewedBy: { select: { login: true } },
      },
    }),
    db.payment.aggregate({
      where: { status: "paid", paidAt: { gt: new Date(Date.now() - 86_400_000) } },
      _sum: { amountRub: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">
          Курс 1 ₽ = {CONFIG.vcPerRub} VC · за сутки одобрено {paidToday._sum.amountRub ?? 0} ₽
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Заявки на пополнение</h1>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Новые ({pending.length})</h2>
        {pending.length === 0 && <p className="muted text-sm">Разобрано всё.</p>}

        {pending.map((payment) => (
          <div key={payment.id} className="panel p-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="text-lg font-semibold">{payment.user.login}</h3>
              <span className="text-sm" style={{ color: "var(--gold)" }}>
                {payment.amountRub} ₽ → {payment.vcAmount.toLocaleString("ru")} VC
              </span>
              <span className="muted text-sm">баланс {payment.user.balanceVc.toLocaleString("ru")} VC</span>
              <span className="muted ml-auto text-xs">{payment.createdAt.toLocaleString("ru")}</span>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="muted w-28 shrink-0">Способ</dt>
                <dd>{payment.method ?? "—"}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="muted w-28 shrink-0">Контакт</dt>
                <dd className="min-w-0 break-all">{payment.contact ?? "—"}</dd>
              </div>
              {payment.comment && (
                <div className="flex gap-3">
                  <dt className="muted w-28 shrink-0">Комментарий</dt>
                  <dd className="min-w-0 break-words">{payment.comment}</dd>
                </div>
              )}
            </dl>

            <PaymentReview paymentId={payment.id} />
          </div>
        ))}
      </section>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">История решений</h2>
        {history.length === 0 && <p className="muted mt-3 text-sm">Пока пусто.</p>}
        <div className="mt-4 space-y-3">
          {history.map((payment) => (
            <div
              key={payment.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b pb-3 text-sm last:border-0 last:pb-0"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-medium">{payment.user.login}</span>
              <span className="tabular-nums">
                {payment.amountRub} ₽ → {payment.vcAmount.toLocaleString("ru")} VC
              </span>
              <span
                style={{
                  color: payment.status === "paid" ? "var(--gold)" : "var(--danger)",
                }}
              >
                {STATUS_LABEL[payment.status] ?? payment.status}
              </span>
              <span className="muted">{payment.reviewedBy?.login ?? "—"}</span>
              {payment.reviewNote && <span className="muted">{payment.reviewNote}</span>}
              <span className="muted ml-auto text-xs">
                {(payment.reviewedAt ?? payment.createdAt).toLocaleString("ru")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
