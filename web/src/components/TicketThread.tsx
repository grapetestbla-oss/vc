import { translator } from "@/lib/i18n.server";
import { TICKET_STATUS_LABEL } from "@/lib/tickets";

export type ThreadMessage = {
  id: string;
  fromStaff: boolean;
  text: string;
  createdAt: Date;
  author: { login: string } | null;
};

const STATUS_COLOR: Record<string, string | undefined> = {
  open: "var(--gold)",
  answered: undefined,
  closed: "var(--muted)",
};

/** Переписка по обращению: сообщения администрации выделены цветом. */
export default async function TicketThread({
  subject,
  status,
  createdAt,
  messages,
  author,
}: {
  subject: string;
  status: string;
  createdAt: Date;
  messages: ThreadMessage[];
  author?: string;
}) {
  const t = await translator();
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-lg font-semibold">{subject}</h3>
        {author && <span className="muted text-sm">{author}</span>}
        <span className="text-sm" style={{ color: STATUS_COLOR[status] }}>
          {t(TICKET_STATUS_LABEL[status] ?? status)}
        </span>
        <span className="muted ml-auto text-xs">{createdAt.toLocaleString("ru")}</span>
      </div>

      <div className="mt-4 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: message.fromStaff ? "rgba(245,196,81,0.08)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${message.fromStaff ? "rgba(245,196,81,0.25)" : "var(--border)"}`,
            }}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className="text-xs font-semibold"
                style={{ color: message.fromStaff ? "var(--gold)" : undefined }}
              >
                {message.fromStaff ? t("Администрация") : (message.author?.login ?? t("Игрок"))}
              </span>
              <span className="muted text-xs">{message.createdAt.toLocaleString("ru")}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{message.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
