import Link from "next/link";
import { db } from "@/lib/db";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";
import { translate } from "@/lib/i18n";
import { getLang } from "@/lib/i18n.server";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "Деморган вместо бана",
    text: "За мелкое нарушение вы не теряете прогресс — отрабатываете срок в шахте. Время идёт 1 к 10 и только пока вы онлайн.",
    accent: "var(--gold)",
  },
  {
    title: "Никаких приватов",
    text: "Мир общий и настоящий. Порядок держат админы, откат гриферства и запись каждого действия, а не таблички «territory claimed».",
    accent: "var(--mint)",
  },
  {
    title: "Донат без преимущества",
    text: "VanillaCoins тратятся на косметику и кейсы. Купить алмазы, элитру или киты нельзя — ванилла остаётся ваниллой.",
    accent: "var(--gold)",
  },
];

export default async function HomePage() {
  const lang = await getLang();
  const t = translate(lang);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [players, online, jailed, news] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 300_000) } } }),
    db.punishment.count({ where: { type: "JAIL", active: true } }),
    db.news.findMany({
      where: { published: true },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 3,
    }),
  ]);
  const todayRegistrations = await db.user.count({ where: { createdAt: { gt: dayAgo } } });

  const stats = [
    { label: t("Игроков"), value: players },
    { label: t("Онлайн сейчас"), value: online, live: true },
    { label: t("Новых за сутки"), value: todayRegistrations },
    { label: t("Отрабатывают срок"), value: jailed },
  ];

  return (
    <div className="space-y-24">
      <section className="relative pt-10 md:pt-20">
        <p className="eyebrow fade-up">vanillacraft.click</p>
        <h1
          className="fade-up mt-4 text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl"
          style={{ animationDelay: "80ms" }}
        >
          {t("Ванилла,")}
          <br />
          <span className="gradient-text">{t("какой она была")}</span>
        </h1>
        <p
          className="fade-up muted mt-6 max-w-xl text-lg"
          style={{ animationDelay: "160ms" }}
        >
          {t("Чистое выживание без приватов и китов за донат. Нарушил — идёшь на исправительные работы, а не в бан-лист.")}
        </p>

        <div className="fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
          <Link href="/register" className="btn">{t("Начать играть")}</Link>
          <Link href="/news" className="btn-ghost">{t("Что нового")}</Link>
        </div>

        <div className="fade-up mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ animationDelay: "320ms" }}>
          {stats.map((stat) => (
            <div key={stat.label} className="panel panel-hover p-5">
              <div className="flex items-center gap-2">
                {stat.live && <span className="live-dot" />}
                <span className="eyebrow">{stat.label}</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                <CountUp value={stat.value} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t("Как здесь устроено")}</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 90}>
              <div className="panel panel-hover h-full p-6">
                <span
                  className="block h-1 w-10 rounded-full"
                  style={{ background: feature.accent }}
                />
                <h3 className="mt-4 text-xl font-semibold">{t(feature.title)}</h3>
                <p className="muted mt-3 text-sm leading-6">{t(feature.text)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {news.length > 0 && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t("Новости")}</h2>
            </Reveal>
            <Link href="/news" className="muted text-sm hover:text-white">
              {t("все новости")} →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {news.map((item, index) => (
              <Reveal key={item.id} delay={index * 90}>
                <Link href={`/news/${item.slug}`} className="panel panel-hover group block h-full p-6">
                  <span className="muted text-xs">
                    {item.createdAt.toLocaleDateString(lang, { day: "numeric", month: "long" })}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold transition-colors group-hover:text-[var(--gold)]">
                    {item.title}
                  </h3>
                  <p className="muted mt-2 line-clamp-3 text-sm">{item.summary}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <Reveal>
        <section className="panel relative overflow-hidden p-10 text-center md:p-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(60% 120% at 50% 0%, rgba(245,196,81,0.12), transparent 70%)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t("Аккаунт один — для сайта и игры")}
            </h2>
            <p className="muted mx-auto mt-4 max-w-xl">
              {t("Зарегистрируйтесь, зайдите на сервер под тем же ником и введите пароль. С нового устройства сервер спросит код из личного кабинета.")}
            </p>
            <Link href="/register" className="btn mt-8">{t("Создать аккаунт")}</Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
