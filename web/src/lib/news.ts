import { botToken, channelChatId, escapeHtml, send } from "./telegram";
/** Заголовок в адрес страницы: латиница как есть, кириллица транслитом. */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  // Пустой заголовок или сплошные символы — подстрахуемся датой.
  return base || `news-${Date.now()}`;
}

export function readingTime(body: string): number {
  return Math.max(1, Math.round(body.trim().split(/\s+/).length / 180));
}

/**
 * Публикация новости в Telegram-канале.
 *
 * Отправляем заголовок, краткое описание и ссылку на полную запись, а не весь
 * текст: в канале длинная простыня читается плохо, а на сайте у новости есть
 * оформление и обложка.
 *
 * Возвращаем причину неудачи, а не молчим: «галочку поставил, а поста нет» —
 * худшее, что может случиться с такой кнопкой. Причину показывает панель.
 */
export async function postToChannel(news: {
  slug: string;
  title: string;
  summary: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!botToken()) return { ok: false, reason: "Не задан TELEGRAM_BOT_TOKEN" };

  const chat = channelChatId();
  if (!chat) return { ok: false, reason: "Не задан TELEGRAM_CHANNEL_ID" };

  const site = process.env.SITE_URL ?? "https://vanillacraft.click";
  const sent = await send(
    chat,
    `<b>${escapeHtml(news.title)}</b>\n\n` +
      `${escapeHtml(news.summary)}\n\n` +
      `${site}/news/${news.slug}`,
  );

  // Бот молчит, когда его не сделали администратором канала: со стороны это
  // выглядит как «ничего не произошло», поэтому говорим прямо.
  if (sent === null) {
    return { ok: false, reason: "Telegram не принял сообщение — бот администратор канала?" };
  }
  return { ok: true };
}
