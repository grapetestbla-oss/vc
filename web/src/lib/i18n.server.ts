import { cookies } from "next/headers";
import { isLang, translate, LANG_COOKIE, type Lang, type Translate } from "./i18n";

/**
 * Язык текущего запроса. Живёт отдельно от словаря: next/headers нельзя
 * тянуть в клиентские компоненты, а переводчик нужен и там, и там.
 */
export async function getLang(): Promise<Lang> {
  // Куки читает и раскладка 404, которую Next собирает без запроса.
  try {
    const value = (await cookies()).get(LANG_COOKIE)?.value;
    return isLang(value) ? value : "ru";
  } catch {
    return "ru";
  }
}

/** Переводчик для серверных компонентов: const t = await translator(). */
export async function translator(): Promise<Translate> {
  return translate(await getLang());
}
