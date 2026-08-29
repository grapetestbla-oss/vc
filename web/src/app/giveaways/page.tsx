import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { activeGiveaways, hoursOf, GIVEAWAY_STATUS_LABEL } from "@/lib/giveaways";
import GiveawayJoin from "@/components/GiveawayJoin";
import Reveal from "@/components/Reveal";
import { translator } from "@/lib/i18n.server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Розыгрыши — VanillaCraft" };

export default async function GiveawaysPage() {
  const t = await translator();
  const user = await currentUser();

  const [active, finished, myEntries] = await Promise.all([
    activeGiveaways(),
    db.giveaway.findMany({
      where: { status: "finished" },
      orderBy: { drawnAt: "desc" },
      take: 10,
      include: { winner: { select: { login: true } } },
    }),
    user
      ? db.giveawayEntry.findMany({ where: { userId: user.id }, select: { giveawayId: true } })
      : Promise.resolve([]),
  ]);

  const joined = new Set(myEntries.map((entry) => entry.giveawayId));
  const hours = user ? hoursOf(user.playtimeSec) : 0;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow fade-up">
          {user ? t("Наиграно: {n} ч", { n: hours }) : t("Розыгрыши среди игроков сервера")}
        </p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">{t("Розыгрыши")}</h1>
        <p className="fade-up muted max-w-2xl">
          {t("Участвуют те, кто действительно играет: у каждого розыгрыша своё условие по наигранному времени. Победителя выбирает сервер по сохранённому сиду — его видно после розыгрыша, результат можно пересчитать.")}
        </p>
      </header>

      {active.length === 0 && (
        <p className="muted text-sm">{t("Сейчас активных розыгрышей нет. Загляните позже.")}</p>
      )}

      {active.map((giveaway, index) => (
        <Reveal key={giveaway.id} delay={index * 70}>
          <section className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold">{giveaway.title}</h2>
              <span className="muted text-sm">
                {t("участников: {n}", { n: giveaway._count.entries })}
              </span>
              {giveaway.endsAt && (
                <span className="muted ml-auto text-xs">
                  {t("до {date}", { date: giveaway.endsAt.toLocaleString("ru") })}
                </span>
              )}
            </div>

            <p className="mt-3 text-lg font-semibold" style={{ color: "var(--gold)" }}>
              {giveaway.prize}
            </p>
            {giveaway.description && (
              <p className="muted mt-2 whitespace-pre-wrap text-sm">{giveaway.description}</p>
            )}
            <p className="muted mt-3 text-sm">
              {t("Условие: {n} ч на сервере.", { n: giveaway.requiredHours })}
            </p>

            {user ? (
              <GiveawayJoin
                giveawayId={giveaway.id}
                hours={hours}
                requiredHours={giveaway.requiredHours}
                joined={joined.has(giveaway.id)}
              />
            ) : (
              <Link href="/login?next=/giveaways" className="btn mt-5 inline-flex">
                {t("Войти, чтобы участвовать")}
              </Link>
            )}
          </section>
        </Reveal>
      ))}

      {finished.length > 0 && (
        <Reveal>
          <section className="panel p-5 sm:p-6">
            <h2 className="text-lg font-semibold">{t("Прошедшие розыгрыши")}</h2>
            <div className="mt-4 space-y-3">
              {finished.map((giveaway) => (
                <div
                  key={giveaway.id}
                  className="border-b pb-3 text-sm last:border-0 last:pb-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium">{giveaway.title}</span>
                    <span style={{ color: "var(--gold)" }}>{giveaway.winner?.login ?? "—"}</span>
                    <span className="muted">{t(GIVEAWAY_STATUS_LABEL[giveaway.status])}</span>
                    <span className="muted ml-auto text-xs">
                      {giveaway.drawnAt?.toLocaleString("ru")}
                    </span>
                  </div>
                  <div className="muted mt-1 break-all font-mono text-xs">
                    {t("приз:")} {giveaway.prize} ·{" "}
                    {t("участников: {n}", { n: giveaway.drawnFrom ?? 0 })} · {t("сид:")}{" "}
                    {giveaway.drawSeed}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}
    </div>
  );
}
