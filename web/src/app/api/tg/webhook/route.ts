import { handleCommand } from "@/lib/tgcommands";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { accountOf } from "@/lib/telegram";
import { answerJoinRequest, relayChatId, sendMessage, webhookSecret } from "@/lib/telegram";

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

  const update = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const joinRequest = update?.chat_join_request as Record<string, unknown> | undefined;
  if (joinRequest) return handleJoinRequest(joinRequest);

  const message = update?.message as Record<string, unknown> | undefined;
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

/**
 * Заявка на вступление в группу. Пускаем только тех, чей Telegram привязан к
 * игровому аккаунту: в группе идёт игровой чат, и отвечать в него может любой
 * её участник.
 *
 * Ответ человеку отправляем до решения — Telegram даёт для этого отдельный чат,
 * и работает он лишь пока заявка не обработана.
 */
async function handleJoinRequest(request: Record<string, unknown>) {
  const chat = request.chat as { id?: number | string } | undefined;
  const from = request.from as { id?: number | string; username?: string } | undefined;
  const relay = relayChatId();
  if (!chat?.id || !from?.id || !relay || String(chat.id) !== relay) {
    return Response.json({ ok: true });
  }

  const user = await accountOf(String(from.id));
  // Личный чат заявки: у самого пользователя бот мог быть и не запущен.
  const dialog = String(request.user_chat_id ?? from.id);

  if (user) {
    await sendMessage(
      dialog,
      `Заявка принята: ваш Telegram привязан к аккаунту <b>${user.login}</b>.`,
    );
  } else {
    await sendMessage(
      dialog,
      [
        "Заявка отклонена: этот Telegram не привязан к игровому аккаунту.",
        "",
        "Зайдите на сервер, введите <code>/tg</code> — бот подскажет код. После привязки подайте заявку снова.",
      ].join("\n"),
    );
  }

  await answerJoinRequest(relay, String(from.id), user !== null);
  await audit({
    actorId: null,
    action: user ? "tg.join.approved" : "tg.join.declined",
    targetUserId: user?.id ?? null,
    meta: { telegramId: String(from.id), username: from.username ?? null },
  });

  return Response.json({ ok: true });
}
