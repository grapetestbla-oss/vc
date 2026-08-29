import { EN } from "./dictionary.en";

/**
 * Язык сайта. Ключ словаря — русская строка: без неё сайт всё равно работает,
 * а непереведённое место просто остаётся по-русски вместо пустоты или кода.
 */
export const LANGS = ["ru", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_COOKIE = "lang";

export type Vars = Record<string, string | number>;

export function isLang(value: string | undefined | null): value is Lang {
  return value === "ru" || value === "en";
}

/** Подстановка вида {n}: t("Баланс: {n} VC", { n: 100 }). */
function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Русские склонения: 1 сектор, 2 сектора, 5 секторов. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function translate(lang: Lang) {
  return (text: string, vars?: Vars): string => {
    if (lang === "ru") return fill(text, vars);
    return fill(EN[text] ?? text, vars);
  };
}

export type Translate = ReturnType<typeof translate>;
