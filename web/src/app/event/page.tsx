import Link from "next/link";
import { currentUser } from "@/lib/session";
import Reveal from "@/components/Reveal";
import { EVENT_DAYS, COOLDOWN_HOURS, getEvent, questStates } from "@/lib/quests";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** «12 ч 30 мин» — в часах и минутах: секунды на полусуточном кулдауне не нужны. */
function humanCooldown(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${Math.max(1, minutes)} мин`;
}

const GOALS: Record<string, string> = {
  BREAK: "сломать",
  KILL: "убить",
  CRAFT: "скрафтить",
  DELIVER: "сдать командой /event сдать",
};

export default async function EventPage() {
  const user = await currentUser();
  const [event, quests] = await Promise.all([getEvent(), questStates(user?.id ?? null)]);
  const cases = await db.caseType.findMany({ select: { key: true, name: true } });
  const caseName = new Map(cases.map((item) => [item.key, item.name]));

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">
          {event.enabled ? `День ${event.day} из ${EVENT_DAYS}` : "Событие сезона"}
        </p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Осенний ивент</h1>
        <p className="fade-up muted max-w-2xl">
          Две недели, семь заданий, новое — через день. Каждое сдаётся сколько угодно раз: сдали —{" "}
          {COOLDOWN_HOURS} часов кулдауна, отстоялись — счётчик обнулился и идёт новый круг за новый
          кейс. Прогресс считает сайт, так что выход из игры его не сбрасывает.
        </p>
        {!event.enabled && (
          <p className="fade-up text-sm" style={{ color: "var(--gold)" }}>
            Сейчас ивент не идёт — задания ниже открыты для ознакомления.
          </p>
        )}
        {!user && (
          <p className="fade-up muted text-sm">
            <Link href="/login" className="underline hover:text-white">
              Войдите
            </Link>
            , чтобы видеть свой прогресс.
          </p>
        )}
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {quests.map((quest, index) => {
          const percent = Math.min(100, Math.round((quest.amount / quest.target) * 100));
          const locked = !quest.open;
          return (
            <Reveal key={quest.key} delay={index * 60}>
              <article
                className="panel flex h-full flex-col gap-3 p-5"
                style={{ opacity: locked ? 0.55 : 1 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">
                      {locked ? `Откроется на ${quest.opensOnDay}-й день` : `День ${quest.opensOnDay}`}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">{quest.title}</h2>
                  </div>
                  <span className="muted whitespace-nowrap text-xs">
                    {caseName.get(quest.rewardCase) ?? quest.rewardCase}
                  </span>
                </div>

                <p className="muted text-sm">{quest.story}</p>

                <p className="text-sm">
                  <span className="muted">Цель: </span>
                  {GOALS[quest.goal] ?? quest.goal} {quest.target.toLocaleString("ru")}
                </p>

                <div className="mt-auto space-y-2">
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percent}%`, background: "var(--gold)" }}
                    />
                  </div>
                  <p className="muted text-xs">
                    {quest.cooldownSec > 0
                      ? `Сдано. Новый круг через ${humanCooldown(quest.cooldownSec)}`
                      : `${quest.amount.toLocaleString("ru")} из ${quest.target.toLocaleString("ru")}`}
                    {quest.rounds > 0 && ` · кругов сдано: ${quest.rounds}`}
                  </p>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>

      <p className="muted text-sm">
        Награда — билет на кейс: он ждёт в <Link href="/cases" className="underline hover:text-white">кейсах</Link>{" "}
        и в игре по команде <code>/cases</code>, открывается без списания.
      </p>
    </div>
  );
}
