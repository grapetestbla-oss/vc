import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { escapeHtml, relayChatId, send } from "@/lib/telegram";

/**
 * Мост между игровым чатом и Telegram.
 *
 * Один запрос работает в обе стороны: плагин присылает накопленные сообщения
 * игроков, а в ответ забирает то, что написали в Telegram. Так плагину хватает
 * одного таймера, а не двух.
 *
 * Сообщения игроков идут пачкой: Telegram ограничивает частоту сообщений в
 * группу примерно двадцатью в минуту, и построчная отправка выбила бы лимит за
 * полминуты.
 */

/** Запас под лимит Telegram в 4096 символов. */
const MAX_LENGTH = 3500;

type Line = { player?: unknown; text?: unknown };

function format(lines: Line[]): string {
  const rendered: string[] = [];
  let length = 0;

  for (const line of lines) {
    const player = typeof line.player === "string" ? line.player.slice(0, 32) : "";
    const text = typeof line.text === "string" ? line.text.slice(0, 512) : "";
    if (!player || !text.trim()) continue;

    const entry = `🎮 <b>${escapeHtml(player)}</b>\n${escapeHtml(text)}`;
    if (length + entry.length > MAX_LENGTH) break;
    rendered.push(entry);
    length += entry.length + 2;
  }

  return rendered.join("\n\n");
}

export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const body = (await request.json().catch(() => null)) as { lines?: Line[] } | null;
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, 60) : [];

  let sent = 0;
  const chatId = relayChatId();
  if (chatId && lines.length > 0) {
    const text = format(lines);
    if (text && (await send(chatId, text)) !== null) sent = lines.length;
  }

  // Обратная сторона: то, что написали в Telegram ответом на игровой чат.
  const incoming = await db.gameChatMessage.findMany({
    where: { deliveredAt: null },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  if (incoming.length > 0) {
    await db.gameChatMessage.updateMany({
      where: { id: { in: incoming.map((item) => item.id) } },
      data: { deliveredAt: new Date() },
    });
  }

  return Response.json({
    ok: true,
    sent,
    incoming: incoming.map((item) => ({ author: item.author, text: item.text })),
  });
}
