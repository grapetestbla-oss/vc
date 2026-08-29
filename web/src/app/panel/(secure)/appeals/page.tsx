import Link from "next/link";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { APPEAL_STATUS_LABEL } from "@/lib/appeals";
import AppealReview from "@/components/AppealReview";

export const dynamic = "force-dynamic";

export default async function PanelAppealsPage() {
  const admin = await requirePanel(5, "appeals.review");
  if (!admin) return null;

  const [pending, history] = await Promise.all([
    db.appeal.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            login: true,
            punishments: {
              where: { active: true },
              orderBy: { issuedAt: "desc" },
              include: { by: { select: { login: true } } },
            },
          },
        },
      },
    }),
    db.appeal.findMany({
      where: { status: { not: "pending" } },
      orderBy: { reviewedAt: "desc" },
      take: 25,
      include: { reviewedBy: { select: { login: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Разбан рассматривает только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Заявления о разбане</h1>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Новые ({pending.length})</h2>
        {pending.length === 0 && <p className="muted text-sm">Разобрано всё.</p>}

        {pending.map((appeal) => (
          <div key={appeal.id} className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="text-lg font-semibold">{appeal.login}</h3>
              {appeal.user ? (
                <Link
                  href={`/panel/users/${appeal.user.id}`}
                  className="muted text-sm underline hover:text-white"
                >
                  карточка игрока
                </Link>
              ) : (
                <span className="text-sm" style={{ color: "var(--danger)" }}>
                  аккаунта с таким ником нет
                </span>
              )}
              <span className="muted ml-auto text-xs">{appeal.createdAt.toLocaleString("ru")}</span>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="muted w-24 shrink-0 sm:w-28">Контакт</dt>
                <dd className="min-w-0 break-all">{appeal.contact}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="muted w-24 shrink-0 sm:w-28">IP подачи</dt>
                <dd className="min-w-0 break-all">{appeal.ip ?? "—"}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="muted w-24 shrink-0 sm:w-28">Наказания</dt>
                <dd className="min-w-0">
                  {appeal.user && appeal.user.punishments.length > 0
                    ? appeal.user.punishments.map((punishment) => (
                        <div key={punishment.id}>
                          {punishment.type} · {punishment.reason} · выдал{" "}
                          {punishment.by?.login ?? "система"} ·{" "}
                          {punishment.issuedAt.toLocaleString("ru")}
                        </div>
                      ))
                    : "активных нет"}
                </dd>
              </div>
            </dl>

            <p className="mt-4 whitespace-pre-wrap text-sm">{appeal.text}</p>

            <AppealReview appealId={appeal.id} />
          </div>
        ))}
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold">История решений</h2>
        {history.length === 0 && <p className="muted mt-3 text-sm">Пока пусто.</p>}
        <div className="mt-4 space-y-3">
          {history.map((appeal) => (
            <div
              key={appeal.id}
              className="border-b pb-3 text-sm last:border-0 last:pb-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{appeal.login}</span>
                <span
                  style={{
                    color: appeal.status === "approved" ? "var(--gold)" : "var(--danger)",
                  }}
                >
                  {APPEAL_STATUS_LABEL[appeal.status] ?? appeal.status}
                </span>
                <span className="muted">{appeal.reviewedBy?.login ?? "—"}</span>
              </div>
              <div className="muted mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                <span>{(appeal.reviewedAt ?? appeal.createdAt).toLocaleString("ru")}</span>
                {appeal.reviewNote && <span className="w-full">{appeal.reviewNote}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
