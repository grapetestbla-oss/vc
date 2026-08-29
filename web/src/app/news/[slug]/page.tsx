import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import Reveal from "@/components/Reveal";
import { translate } from "@/lib/i18n";
import { getLang } from "@/lib/i18n.server";
import { readingTime } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const news = await db.news.findUnique({ where: { slug } });
  return news
    ? { title: `${news.title} — VanillaCoins`, description: news.summary }
    : { title: "Новость не найдена" };
}

export default async function NewsItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const lang = await getLang();
  const t = translate(lang);
  const { slug } = await params;
  const news = await db.news.findUnique({
    where: { slug },
    include: { author: { select: { login: true } } },
  });
  if (!news || !news.published) notFound();

  const others = await db.news.findMany({
    where: { published: true, NOT: { id: news.id } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return (
    <article className="space-y-10">
      <Link href="/news" className="muted inline-flex items-center gap-2 text-sm hover:text-white">
        ← {t("Все новости")}
      </Link>

      <header className="space-y-4 fade-up">
        <p className="eyebrow">
          {news.createdAt.toLocaleDateString(lang, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}{" "}
          · {t("{n} мин чтения", { n: readingTime(news.body) })}
        </p>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{news.title}</h1>
        <p className="muted max-w-3xl text-lg">{news.summary}</p>
      </header>

      <Reveal>
        <div className="panel p-8 md:p-10">
          {/* Текст новости пишет администрация; переносы строк сохраняем как есть. */}
          <div className="space-y-4 whitespace-pre-wrap text-[15px] leading-7">{news.body}</div>
          <p className="muted mt-8 text-sm">— {news.author?.login ?? t("администрация")}</p>
        </div>
      </Reveal>

      {others.length > 0 && (
        <section className="space-y-4">
          <h2 className="eyebrow">{t("Ещё новости")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {others.map((item, index) => (
              <Reveal key={item.id} delay={index * 60}>
                <Link href={`/news/${item.slug}`} className="panel panel-hover group block p-5">
                  <span className="muted text-xs">
                    {item.createdAt.toLocaleDateString(lang, { day: "numeric", month: "long" })}
                  </span>
                  <h3 className="mt-1 font-semibold transition-colors group-hover:text-[var(--gold)]">
                    {item.title}
                  </h3>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
