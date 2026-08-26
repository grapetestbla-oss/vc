import { currentUser } from "@/lib/session";
import { createTicket, replyTicket, closeTicket, TicketError } from "@/lib/tickets";
import { rateLimit } from "@/lib/ratelimit";

/** Создание обращения и ответы игрока в свою переписку. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { action, ticketId, subject, text } = (await request.json()) as {
    action?: "create" | "reply" | "close";
    ticketId?: string;
    subject?: string;
    text?: string;
  };

  if (!rateLimit(`ticket:${user.id}`, 20, 3600)) {
    return Response.json({ error: "Слишком много сообщений. Подождите." }, { status: 429 });
  }

  try {
    if (action === "reply") {
      if (!ticketId) return Response.json({ error: "ticketId required" }, { status: 400 });
      await replyTicket({ ticketId, userId: user.id, text: text ?? "", fromStaff: false });
      return Response.json({ ok: true });
    }

    if (action === "close") {
      if (!ticketId) return Response.json({ error: "ticketId required" }, { status: 400 });
      await closeTicket({ ticketId, userId: user.id, byStaff: false });
      return Response.json({ ok: true });
    }

    const ticket = await createTicket({
      userId: user.id,
      subject: subject ?? "",
      text: text ?? "",
    });
    return Response.json({ ok: true, ticketId: ticket.id });
  } catch (error) {
    if (error instanceof TicketError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
