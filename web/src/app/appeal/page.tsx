import Link from "next/link";
import AppealForm from "@/components/AppealForm";
import Reveal from "@/components/Reveal";
import { WARN_TO_BAN_DAYS } from "@/lib/punishments";
import { translator } from "@/lib/i18n.server";

export const metadata = { title: "Заявление о разбане — VanillaCraft" };

export default async function AppealPage() {
  const t = await translator();
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow fade-up">{t("Разбан")}</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">
          {t("Заявление о разбане")}
        </h1>
        <p className="fade-up muted max-w-2xl">
          {t("Форма для тех, кого забанили. Входить на сайт не нужно — достаточно ника и контакта. Заявление читает главная администрация, ответ приходит на указанный контакт.")}
        </p>
      </header>

      <Reveal>
        <AppealForm />
      </Reveal>

      <Reveal>
        <section className="panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{t("Что стоит знать")}</h2>
          <ul className="muted mt-3 space-y-2 text-sm">
            <li>
              • {t("Бан за два активных варна снимается сам через {n} дней — ждать проще, чем писать.", { n: WARN_TO_BAN_DAYS })}
            </li>
            <li>• {t("Одно открытое заявление на ник. Новое можно подать после решения по прошлому.")}</li>
            <li>• {t("Заявление за другого игрока не рассматривается: пишет тот, кого забанили.")}</li>
            <li>
              • {t("Врать смысла нет: у администрации есть журнал действий, логи входов и запись наказания с причиной.")}
            </li>
            <li>
              • {t("Правила сервера — на странице")}{" "}
              <Link href="/rules" className="underline hover:text-white">
                {t("«Правила»")}
              </Link>
              .
            </li>
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
