import Link from "next/link";
import { db } from "@/lib/db";
import Reveal from "@/components/Reveal";
import { readingTime } from "@/lib/news";

export const dynamic = "force-dynamic";

export const metadata = { title: "Новости — VanillaCoins" };

export default async function NewsPage() {
  const news = await db.news.findMany({
    where: { published: true },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 30,
    include: { author: { select: { login: true } } },
  });

  const [lead, ...rest] = news;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Что происходит на сервере</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Новости</h1>
      </header>

      {news.length === 0 && (
        <p className="muted">Пока ничего не публиковали.</p>
      )}

      {lead && (
        <Reveal>
          <Link
            href={`/news/${lead.slug}`}
            className="panel panel-hover group block overflow-hidden p-8 md:p-10"
          >
            <div className="flex flex-wrap items-center gap-3">
              {lead.pinned && (
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: "rgba(245,196,81,0.14)", color: "var(--gold)" }}
                >
                  Закреплено
                </span>
              )}
              <span className="muted text-sm">
                {lead.createdAt.toLocaleDateString("ru", { day: "numeric", month: "long" })} ·{" "}
                {readingTime(lead.body)} мин чтения
              </span>
            </div>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight transition-colors group-hover:text-[var(--gold)] md:text-4xl">
              {lead.title}
            </h2>
            <p className="muted mt-3 max-w-3xl text-lg">{lead.summary}</p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm" style={{ color: "var(--gold)" }}>
              Читать
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </span>
          </Link>
        </Reveal>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {rest.map((item, index) => (
          <Reveal key={item.id} delay={index * 60}>
            <Link
              href={`/news/${item.slug}`}
              className="panel panel-hover group flex h-full flex-col p-6"
            >
              <span className="muted text-xs">
                {item.createdAt.toLocaleDateString("ru", { day: "numeric", month: "long" })}
              </span>
              <h3 className="mt-2 text-xl font-semibold transition-colors group-hover:text-[var(--gold)]">
                {item.title}
              </h3>
              <p className="muted mt-2 line-clamp-3 flex-1 text-sm">{item.summary}</p>
              <span className="muted mt-4 text-xs">
                {item.author?.login ?? "администрация"} · {readingTime(item.body)} мин
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
