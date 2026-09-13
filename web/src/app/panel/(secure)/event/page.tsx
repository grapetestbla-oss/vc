import { requirePanel } from "@/lib/panel";
import { db } from "@/lib/db";
import { EVENT_DAYS, QUESTS, getEvent } from "@/lib/quests";
import EventToggle from "@/components/EventToggle";

/** Ключи целей — из кода, а администрации нужны слова. */
const GOALS: Record<string, string> = {
  BREAK: "сломать",
  KILL: "убить",
  CRAFT: "скрафтить",
  DELIVER: "сдать",
};

export const dynamic = "force-dynamic";

export default async function PanelEventPage() {
  const admin = await requirePanel(5, "purge.toggle");
  if (!admin) return null;

  const [event, cases] = await Promise.all([
    getEvent(),
    db.caseType.findMany({ select: { key: true, name: true } }),
  ]);
  const caseName = new Map(cases.map((item) => [item.key, item.name]));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Осенний ивент</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Две недели, семь заданий, новое — через день. Задание сдаётся сколько угодно раз: сдал —
          двенадцать часов кулдауна, отстоялся — счётчик обнулился и идёт новый круг за новый кейс.
          Прогресс считает сайт, поэтому выход из игры его не сбрасывает.
        </p>
      </div>

      <section className="panel p-5 sm:p-6">
        <EventToggle
          enabled={event.enabled}
          startsAt={event.startsAt}
          endsAt={event.endsAt}
          day={event.day}
          days={EVENT_DAYS}
        />
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Задания</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted text-left">
                <th className="pb-2 pr-4 font-normal">День</th>
                <th className="pb-2 pr-4 font-normal">Задание</th>
                <th className="pb-2 pr-4 font-normal">Цель</th>
                <th className="pb-2 font-normal">Кейс</th>
              </tr>
            </thead>
            <tbody>
              {QUESTS.map((quest) => (
                <tr key={quest.key} className="border-t border-white/5">
                  <td className="py-2 pr-4">{quest.opensOnDay}</td>
                  <td className="py-2 pr-4">{quest.title}</td>
                  <td className="py-2 pr-4">
                    {GOALS[quest.goal] ?? quest.goal} {quest.target.toLocaleString("ru")}
                  </td>
                  <td className="py-2">{caseName.get(quest.rewardCase) ?? quest.rewardCase}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
