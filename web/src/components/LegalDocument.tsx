import Link from "next/link";
import { LEGAL_UPDATED } from "@/lib/legal";
import { translate } from "@/lib/i18n";
import { getLang } from "@/lib/i18n.server";

/** Блок раздела: абзац или список — порядок внутри раздела сохраняется. */
export type Block = string | string[];
export type Section = { title: string; blocks: Block[] };

export default async function LegalDocument({
  title,
  summary,
  sections,
  footer,
}: {
  title: string;
  summary: string;
  sections: Section[];
  footer?: string;
}) {
  const lang = await getLang();
  const t = translate(lang);
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow fade-up">{t("Редакция от {date}", { date: LEGAL_UPDATED })}</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
        <p className="fade-up muted max-w-3xl">{summary}</p>
      </header>

      {lang !== "ru" && (
        // Юридический текст переводить нельзя: сила остаётся за русской
        // редакцией, поэтому документ показываем как есть и говорим об этом.
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(245,196,81,0.1)", color: "var(--gold)" }}
        >
          {t("Документ имеет силу только в русской редакции — ниже она приведена без перевода.")}
        </p>
      )}

      <div className="panel space-y-8 p-6 sm:p-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.blocks.map((block, index) =>
              Array.isArray(block) ? (
                <ul key={index} className="muted space-y-2 text-sm leading-relaxed">
                  {block.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span style={{ color: "var(--gold)" }}>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={index} className="muted text-sm leading-relaxed">
                  {block}
                </p>
              ),
            )}
          </section>
        ))}

        {footer && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--gold)" }}>
            {footer}
          </p>
        )}
      </div>

      <p className="muted text-sm">
        {t("Вопросы по документам — через")}{" "}
        <Link href="/tickets" className="underline hover:text-white">
          {t("обращение в поддержку")}
        </Link>
        .
      </p>
    </div>
  );
}
