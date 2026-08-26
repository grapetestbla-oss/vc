"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Новое обращение: тема и первое сообщение. */
export function NewTicketForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      className="panel space-y-4 p-5 sm:p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        setMessage(null);
        const response = await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            subject: data.get("subject"),
            text: data.get("text"),
          }),
        });
        const result = await response.json();
        setBusy(false);
        setOk(response.ok);
        setMessage(response.ok ? "Обращение создано" : (result.error ?? "Ошибка"));
        if (response.ok) {
          form.reset();
          router.refresh();
        }
      }}
    >
      <h2 className="text-lg font-semibold">Новое обращение</h2>

      <label className="block">
        <span className="eyebrow">Тема</span>
        <input name="subject" className="input mt-1 w-full" placeholder="Коротко о проблеме" required />
      </label>

      <label className="block">
        <span className="eyebrow">Сообщение</span>
        <textarea
          name="text"
          className="input mt-1 h-32 w-full"
          placeholder="Опишите, что случилось: ник, время, что делали. Чем подробнее, тем быстрее разберёмся."
          required
        />
      </label>

      <div className="space-y-2 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
        <button className="btn w-full sm:w-auto" disabled={busy}>
          {busy ? "Отправляем…" : "Отправить"}
        </button>
        {message && (
          <span className="block text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}

/** Ответ в переписку: используется и игроком, и администрацией в панели. */
export function TicketReply({
  ticketId,
  endpoint,
  canClose,
}: {
  ticketId: string;
  endpoint: "/api/tickets" | "/api/panel/ticket";
  canClose: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send(action: "reply" | "close") {
    setBusy(true);
    setMessage(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ticketId, text }),
    });
    const result = await response.json();
    setBusy(false);
    setMessage(response.ok ? null : (result.error ?? "Ошибка"));
    if (response.ok) {
      setText("");
      router.refresh();
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <textarea
        className="input h-24 w-full"
        placeholder="Ответ"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy || text.trim().length < 2} onClick={() => send("reply")}>
          Ответить
        </button>
        {canClose && (
          <button className="btn-ghost" disabled={busy} onClick={() => send("close")}>
            Закрыть обращение
          </button>
        )}
        {message && (
          <span className="text-sm" style={{ color: "var(--danger)" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
