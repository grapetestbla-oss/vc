"use client";

import { createContext, useContext } from "react";
import { translate, type Lang, type Translate } from "@/lib/i18n";

const LangContext = createContext<{ lang: Lang; t: Translate }>({
  lang: "ru",
  t: translate("ru"),
});

/** Язык для клиентских компонентов: значение приходит с сервера, из куки. */
export default function LangProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <LangContext.Provider value={{ lang, t: translate(lang) }}>{children}</LangContext.Provider>
  );
}

export function useLang(): Lang {
  return useContext(LangContext).lang;
}

export function useT(): Translate {
  return useContext(LangContext).t;
}
