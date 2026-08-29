import Link from "next/link";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { TicketReply } from "@/components/TicketForms";
import TicketThread from "@/components/TicketThread";
import { TICKET_STATUS_LABEL } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function PanelTicketsPage() {
  const admin = await requirePanel(5, "tickets.answer");
  if (!admin) return null;

  const [active, closed] = await Promise.all([
    db.ticket.findMany({
      where: { status: { not: "closed" } },
      orderBy: [{ status: "asc" }, { updatedAt: "asc" }],
      include: {
        user: { select: { id: true, login: true, balanceVc: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { login: true } } },
        },
      },
    }),
    db.ticket.findMany({
      where: { status: "closed" },
      orderBy: { closedAt: "desc" },
      take: 20,
      include: { user: { select: { login: true } } },
    }),
  ]);

  const waiting = active.filter((ticket) => ticket.status === "open").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор · ждут ответа: {waiting}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Обращения игроков</h1>
      </div>

      <section className="space-y-4">
        {active.length === 0 && <p className="muted text-sm">Открытых обращений нет.</p>}

        {active.map((ticket) => (
          <div key={ticket.id} className="panel p-5 sm:p-6">
            <TicketThread
              subject={ticket.subject}
              status={ticket.status}
              createdAt={ticket.createdAt}
              messages={ticket.messages}
              author={ticket.user.login}
            />
            <div className="muted mt-3 text-xs">
              <Link href={`/panel/users/${ticket.user.id}`} className="underline hover:text-white">
                карточка игрока
              </Link>{" "}
              · баланс {ticket.user.balanceVc.toLocaleString("ru")} VC
            </div>
            <TicketReply ticketId={ticket.id} endpoint="/api/panel/ticket" canClose />
          </div>
        ))}
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Закрытые</h2>
        {closed.length === 0 && <p className="muted mt-3 text-sm">Пока пусто.</p>}
        <div className="mt-4 space-y-2">
          {closed.map((ticket) => (
            <div
              key={ticket.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2 text-sm last:border-0 last:pb-0"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-medium">{ticket.user.login}</span>
              <span className="muted min-w-0 flex-1 truncate">{ticket.subject}</span>
              <span className="muted text-xs">{TICKET_STATUS_LABEL[ticket.status]}</span>
              <span className="muted text-xs">
                {(ticket.closedAt ?? ticket.updatedAt).toLocaleString("ru")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
