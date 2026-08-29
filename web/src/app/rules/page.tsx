import Reveal from "@/components/Reveal";
import { translator } from "@/lib/i18n.server";

const SECTIONS = [
  {
    title: "Запрещено",
    items: [
      "Читы, макросы и любые модификации клиента, дающие преимущество.",
      "Гриферство и воровство: мелкое — деморган, масштабное — бан.",
      "Оскорбления, разжигание, реклама сторонних проектов.",
      "Обход наказания с другого аккаунта — бан обоих.",
      "Отказ пройти проверку по команде /check приравнивается к признанию.",
    ],
  },
  {
    title: "Наказания",
    items: [
      "Деморган: исправительные работы. Время идёт 1 к 10 и только пока вы онлайн.",
      "Варн: действует 7 дней. Два активных варна — автоматический бан на 5 дней.",
      "Бан: закрывает вход по аккаунту и адресу на указанный срок.",
    ],
  },
  {
    title: "Донат",
    items: [
      "VanillaCoins не выводятся в деньги и не передаются между игроками.",
      "За деньги продаётся только косметика и кейсы с косметикой.",
      "Игрового преимущества за деньги на сервере нет и не будет.",
    ],
  },
];

export default async function RulesPage() {
  const t = await translator();
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">{t("Коротко и без юридического тумана")}</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">{t("Правила")}</h1>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        {SECTIONS.map((section, index) => (
          <Reveal key={section.title} delay={index * 80}>
            <section className="panel panel-hover h-full p-6">
              <h2 className="text-xl font-semibold">{t(section.title)}</h2>
              <ul className="muted mt-4 space-y-3 text-sm leading-6">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span style={{ color: "var(--gold)" }}>—</span>
                    <span>{t(item)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
