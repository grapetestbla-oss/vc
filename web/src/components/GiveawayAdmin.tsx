"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Создание розыгрыша: название, приз, условие по часам и срок приёма заявок. */
export function GiveawayForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        setMessage(null);
        const response = await fetch("/api/panel/giveaway", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            title: data.get("title"),
            prize: data.get("prize"),
            description: data.get("description"),
            requiredHours: Number(data.get("hours") || 0),
            endsAt: data.get("endsAt") || null,
          }),
        });
        const result = await response.json();
        setBusy(false);
        setOk(response.ok);
        setMessage(response.ok ? "Розыгрыш создан" : (result.error ?? "Ошибка"));
        if (response.ok) {
          form.reset();
          router.refresh();
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Название</span>
          <input name="title" className="input mt-1 w-full" placeholder="Розыгрыш на открытие" required />
        </label>
        <label className="block">
          <span className="eyebrow">Приз</span>
          <input name="prize" className="input mt-1 w-full" placeholder="5000 VC и легендарный кейс" required />
        </label>
        <label className="block">
          <span className="eyebrow">Нужно часов на сервере</span>
          <input name="hours" type="number" className="input mt-1 w-full" defaultValue={15} min={0} />
        </label>
        <label className="block">
          <span className="eyebrow">Приём заявок до — необязательно</span>
          <input name="endsAt" type="datetime-local" className="input mt-1 w-full" />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow">Описание</span>
        <textarea
          name="description"
          className="input mt-1 h-24 w-full"
          placeholder="Условия, дата розыгрыша, как заберём приз"
        />
      </label>

      <div className="space-y-2 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
        <button className="btn w-full sm:w-auto" disabled={busy}>
          {busy ? "Создаём…" : "Создать розыгрыш"}
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

/** Кнопки розыгрыша и отмены. Победитель выбирается сервером по сохранённому сиду. */
export function GiveawayActions({ giveawayId }: { giveawayId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function run(action: "draw" | "cancel") {
    // Оба действия необратимы, поэтому спрашиваем второй раз.
    if (confirm !== action) {
      setConfirm(action);
      setMessage(action === "draw" ? "Нажмите ещё раз: результат не отменить" : "Нажмите ещё раз для отмены розыгрыша");
      return;
    }
    setConfirm(null);
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/giveaway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, giveawayId }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(
      response.ok
        ? action === "draw"
          ? `Победитель: ${data.winner} (из ${data.participants})`
          : "Розыгрыш отменён"
        : (data.error ?? "Ошибка"),
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button className="btn" disabled={busy} onClick={() => run("draw")}>
        {confirm === "draw" ? "Точно разыграть?" : "Разыграть"}
      </button>
      <button className="btn-ghost" disabled={busy} onClick={() => run("cancel")}>
        {confirm === "cancel" ? "Точно отменить?" : "Отменить"}
      </button>
      {message && <span className="muted text-sm">{message}</span>}
    </div>
  );
}
