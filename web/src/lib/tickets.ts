import { db } from "./db";
import { audit } from "./audit";

export class TicketError extends Error {}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  open: "Ждёт ответа",
  answered: "Есть ответ",
  closed: "Закрыт",
};

/** Сколько открытых обращений можно держать одновременно. */
const OPEN_LIMIT = 3;

function clean(text: string, max: number): string {
  return text.trim().replace(/\s+/g, " ").slice(0, max);
}

export async function createTicket(params: { userId: string; subject: string; text: string }) {
  const subject = clean(params.subject, 120);
  const text = params.text.trim().slice(0, 4000);

  if (subject.length < 5) throw new TicketError("Тема слишком короткая");
  if (text.length < 20) throw new TicketError("Опишите вопрос подробнее — минимум 20 символов");

  const open = await db.ticket.count({
    where: { userId: params.userId, status: { not: "closed" } },
  });
  if (open >= OPEN_LIMIT) {
    throw new TicketError(`Больше ${OPEN_LIMIT} открытых обращений держать нельзя`);
  }

  const ticket = await db.ticket.create({
    data: {
      userId: params.userId,
      subject,
      messages: { create: { authorId: params.userId, fromStaff: false, text } },
    },
  });
  await audit({ actorId: params.userId, action: "ticket.create", meta: { ticketId: ticket.id } });
  return ticket;
}

/**
 * Ответ в переписку. Игрок пишет только в свой тикет, администрация — в любой;
 * статус меняется автоматически, чтобы в панели было видно, чья очередь.
 */
export async function replyTicket(params: {
  ticketId: string;
  userId: string;
  text: string;
  fromStaff: boolean;
}) {
  const text = params.text.trim().slice(0, 4000);
  if (text.length < 2) throw new TicketError("Пустое сообщение");

  const ticket = await db.ticket.findUnique({ where: { id: params.ticketId } });
  if (!ticket) throw new TicketError("Обращение не найдено");
  if (!params.fromStaff && ticket.userId !== params.userId) {
    throw new TicketError("Это чужое обращение");
  }
  if (ticket.status === "closed") throw new TicketError("Обращение закрыто");

  await db.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: params.userId,
      fromStaff: params.fromStaff,
      text,
    },
  });
  await db.ticket.update({
    where: { id: ticket.id },
    data: { status: params.fromStaff ? "answered" : "open" },
  });

  return ticket;
}

export async function closeTicket(params: { ticketId: string; userId: string; byStaff: boolean }) {
  const ticket = await db.ticket.findUnique({ where: { id: params.ticketId } });
  if (!ticket) throw new TicketError("Обращение не найдено");
  if (!params.byStaff && ticket.userId !== params.userId) {
    throw new TicketError("Это чужое обращение");
  }
  if (ticket.status === "closed") return ticket;

  const closed = await db.ticket.update({
    where: { id: ticket.id },
    data: { status: "closed", closedAt: new Date() },
  });
  await audit({
    actorId: params.userId,
    action: params.byStaff ? "admin.ticket.close" : "ticket.close",
    targetUserId: ticket.userId,
    meta: { ticketId: ticket.id },
  });
  return closed;
}
