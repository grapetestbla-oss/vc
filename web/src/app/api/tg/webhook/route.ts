import { handleCommand } from "@/lib/tgcommands";
import { db } from "@/lib/db";
import { relayChatId, sendMessage, webhookSecret } from "@/lib/telegram";

/**
 * Приём обновлений Telegram.
 *
 * Адрес вебхука публичный, поэтому писать на него может кто угодно — отсекаем
 * по секрету, который Telegram шлёт заголовком. Пока секрет не задан в
 * окружении, обработчик не принимает ничего: тихо работающий без проверки
 * вебхук хуже неработающего.
 */
export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const update = await request.json().catch(() => null);
  const message = (update as { message?: Record<string, unknown> } | null)?.message;
  if (!message) return Response.json({ ok: true });

  const chat = message.chat as { id?: number | string } | undefined;
  const from = message.from as
    | { id?: number | string; username?: string; first_name?: string; is_bot?: boolean }
    | undefined;
  const text = typeof message.text === "string" ? message.text : "";
  if (!chat?.id || !from?.id || from.is_bot || !text.trim()) {
    return Response.json({ ok: true });
  }

  // Ответ на пересланный игровой чат — это реплика в игру. Считаем ответом
  // только на сообщения самого бота: обычная переписка в группе игроков не
  // касается.
  const repliedTo = message.reply_to_message as { from?: { is_bot?: boolean } } | undefined;
  const relay = relayChatId();
  if (relay && String(chat.id) === relay && repliedTo?.from?.is_bot && !text.startsWith("/")) {
    await db.gameChatMessage.create({
      data: {
        author: (from.username ?? from.first_name ?? "гость").slice(0, 32),
        text: text.slice(0, 256),
      },
    });
    return Response.json({ ok: true });
  }

  if (!text.startsWith("/")) return Response.json({ ok: true });

  const reply = await handleCommand(
    { id: String(from.id), username: from.username, firstName: from.first_name },
    text,
  );
  await sendMessage(String(chat.id), reply);

  // Telegram повторяет доставку на любой не-200: отвечаем успехом всегда,
  // иначе одна упавшая команда повторялась бы бесконечно.
  return Response.json({ ok: true });
}
