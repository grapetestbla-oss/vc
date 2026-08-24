import Link from "next/link";
import AppealForm from "@/components/AppealForm";
import Reveal from "@/components/Reveal";
import { WARN_TO_BAN_DAYS } from "@/lib/punishments";

export const metadata = { title: "Заявление о разбане — VanillaCraft" };

export default function AppealPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Разбан</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">
          Заявление о разбане
        </h1>
        <p className="fade-up muted max-w-2xl">
          Форма для тех, кого забанили. Входить на сайт не нужно — достаточно ника и контакта.
          Заявление читает главная администрация, ответ приходит на указанный контакт.
        </p>
      </header>

      <Reveal>
        <AppealForm />
      </Reveal>

      <Reveal>
        <section className="panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Что стоит знать</h2>
          <ul className="muted mt-3 space-y-2 text-sm">
            <li>
              • Бан за два активных варна снимается сам через {WARN_TO_BAN_DAYS} дней — ждать проще,
              чем писать.
            </li>
            <li>• Одно открытое заявление на ник. Новое можно подать после решения по прошлому.</li>
            <li>• Заявление за другого игрока не рассматривается: пишет тот, кого забанили.</li>
            <li>
              • Врать смысла нет: у администрации есть журнал действий, логи входов и запись
              наказания с причиной.
            </li>
            <li>
              • Правила сервера — на странице{" "}
              <Link href="/rules" className="underline hover:text-white">
                «Правила»
              </Link>
              .
            </li>
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
