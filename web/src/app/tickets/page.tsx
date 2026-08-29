import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { NewTicketForm, TicketReply } from "@/components/TicketForms";
import TicketThread from "@/components/TicketThread";
import Reveal from "@/components/Reveal";
import { translator } from "@/lib/i18n.server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Поддержка — VanillaCraft" };

export default async function TicketsPage() {
  const t = await translator();
  const user = await currentUser();
  if (!user) redirect("/login?next=/tickets");

  const tickets = await db.ticket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { login: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="eyebrow fade-up">{t("Поддержка")}</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">{t("Обращения")}</h1>
        <p className="fade-up muted max-w-2xl">
          {t("Вопросы по аккаунту, пополнению, покупкам и работе сервера. Отвечает главная администрация — ответ появится здесь же, в переписке.")}
        </p>
      </header>

      <Reveal>
        <NewTicketForm />
      </Reveal>

      {tickets.length === 0 && (
        <p className="muted text-sm">{t("Обращений пока нет.")}</p>
      )}

      {tickets.map((ticket, index) => (
        <Reveal key={ticket.id} delay={index * 60}>
          <section className="panel p-5 sm:p-6">
            <TicketThread
              subject={ticket.subject}
              status={ticket.status}
              createdAt={ticket.createdAt}
              messages={ticket.messages}
            />
            {ticket.status !== "closed" && (
              <TicketReply ticketId={ticket.id} endpoint="/api/tickets" canClose />
            )}
          </section>
        </Reveal>
      ))}
    </div>
  );
}
