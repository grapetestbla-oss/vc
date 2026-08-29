"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, LANGS, type Lang } from "@/lib/i18n";
import { useLang } from "./LangProvider";

const LABEL: Record<Lang, string> = { ru: "RU", en: "EN" };

/** Переключатель языка. Выбор живёт в куке — его видит и сервер при отрисовке. */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const router = useRouter();
  const current = useLang();

  function choose(lang: Lang) {
    if (lang === current) return;
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => choose(lang)}
          className="rounded-lg px-2 py-1 text-xs transition-colors"
          style={{
            color: lang === current ? "var(--gold)" : "var(--muted)",
            background: lang === current ? "rgba(245,196,81,0.1)" : "transparent",
          }}
          aria-pressed={lang === current}
        >
          {LABEL[lang]}
        </button>
      ))}
    </div>
  );
}
