import Link from "next/link";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { GIVEAWAY_STATUS_LABEL, hoursOf } from "@/lib/giveaways";
import { GiveawayActions, GiveawayForm } from "@/components/GiveawayAdmin";

export const dynamic = "force-dynamic";

export default async function PanelGiveawaysPage() {
  const admin = await requirePanel(5, "giveaways.manage");
  if (!admin) return null;

  const giveaways = await db.giveaway.findMany({
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: 20,
    include: {
      winner: { select: { login: true } },
      entries: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { login: true, playtimeSec: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Розыгрыши</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Условие по наигранному времени проверяется дважды: когда игрок подаёт заявку и в момент
          розыгрыша. Победителя выбирает сервер по случайному сиду — сид сохраняется и публикуется,
          так что результат можно пересчитать.
        </p>
      </div>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Новый розыгрыш</h2>
        <div className="mt-4">
          <GiveawayForm />
        </div>
      </section>

      {giveaways.map((giveaway) => {
        const eligible = giveaway.entries.filter(
          (entry) => hoursOf(entry.user.playtimeSec) >= giveaway.requiredHours,
        ).length;

        return (
          <section key={giveaway.id} className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg font-semibold">{giveaway.title}</h2>
              <span
                className="text-sm"
                style={{
                  color:
                    giveaway.status === "active"
                      ? "var(--gold)"
                      : giveaway.status === "cancelled"
                        ? "var(--danger)"
                        : undefined,
                }}
              >
                {GIVEAWAY_STATUS_LABEL[giveaway.status]}
              </span>
              <span className="muted ml-auto text-xs">
                {giveaway.startsAt.toLocaleString("ru")}
              </span>
            </div>

            <p className="muted mt-2 text-sm">
              Приз: {giveaway.prize} · условие {giveaway.requiredHours} ч · заявок{" "}
              {giveaway.entries.length}, подходят по условию {eligible}
            </p>

            {giveaway.winner && (
              <p className="mt-2 text-sm" style={{ color: "var(--gold)" }}>
                Победитель: {giveaway.winner.login} (из {giveaway.drawnFrom ?? 0} участников)
              </p>
            )}
            {giveaway.drawSeed && (
              <p className="muted mt-1 break-all font-mono text-xs">сид: {giveaway.drawSeed}</p>
            )}

            {giveaway.entries.length > 0 && (
              <div className="muted mt-3 grid gap-1 text-xs sm:grid-cols-2">
                {giveaway.entries.slice(0, 20).map((entry) => (
                  <span key={entry.id}>
                    {entry.user.login} — {hoursOf(entry.user.playtimeSec)} ч
                    {hoursOf(entry.user.playtimeSec) < giveaway.requiredHours && " (не проходит)"}
                  </span>
                ))}
              </div>
            )}

            {giveaway.status === "active" && <GiveawayActions giveawayId={giveaway.id} />}
          </section>
        );
      })}

      <p className="muted text-sm">
        Публичная страница —{" "}
        <Link href="/giveaways" className="underline hover:text-white">
          /giveaways
        </Link>
        .
      </p>
    </div>
  );
}
