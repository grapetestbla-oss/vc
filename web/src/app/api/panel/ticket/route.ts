import { requirePanel } from "@/lib/panel";
import { replyTicket, closeTicket, TicketError } from "@/lib/tickets";
import { audit, clientIp } from "@/lib/audit";

/** Ответы администрации в обращения. Разбирает их только чиф-администратор. */
export async function POST(request: Request) {
  const admin = await requirePanel(5, "tickets.answer");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { action, ticketId, text } = (await request.json()) as {
    action?: "reply" | "close";
    ticketId?: string;
    text?: string;
  };
  if (!ticketId) return Response.json({ error: "ticketId required" }, { status: 400 });

  try {
    if (action === "close") {
      await closeTicket({ ticketId, userId: admin.id, byStaff: true });
      return Response.json({ ok: true, status: "closed" });
    }

    const ticket = await replyTicket({
      ticketId,
      userId: admin.id,
      text: text ?? "",
      fromStaff: true,
    });
    await audit({
      actorId: admin.id,
      action: "admin.ticket.reply",
      targetUserId: ticket.userId,
      ip: clientIp(request),
      meta: { ticketId },
    });
    return Response.json({ ok: true, status: "answered" });
  } catch (error) {
    if (error instanceof TicketError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
