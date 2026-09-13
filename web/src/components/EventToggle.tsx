"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Значение для input[type=datetime-local]: он понимает только местное время. */
function localInput(ms: number): string {
  const date = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export default function EventToggle({
  enabled,
  startsAt,
  endsAt,
  day,
  days,
}: {
  enabled: boolean;
  startsAt: number | null;
  endsAt: number | null;
  day: number;
  days: number;
}) {
  const router = useRouter();
  const [start, setStart] = useState(localInput(startsAt ?? Date.now()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function apply(next: boolean) {
    // Остановка обнуляет открытые задания игроков, поэтому спрашиваем дважды.
    if (!next && !confirm) {
      setConfirm(true);
      setMessage("Нажмите ещё раз: недобранные круги заданий пропадут");
      return;
    }
    setConfirm(false);
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next, startsAt: next && start ? start : null }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? (next ? "Ивент запущен" : "Ивент остановлен") : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{ background: enabled ? "rgba(255,176,80,0.12)" : "rgba(255,255,255,0.04)" }}
      >
        {enabled
          ? `Идёт день ${day} из ${days}${endsAt ? `, закончится ${new Date(endsAt).toLocaleString("ru")}` : ""}.`
          : startsAt
            ? `Ивент не идёт. Прошлый запуск: ${new Date(startsAt).toLocaleString("ru")}.`
            : "Ивент не запускался."}
      </div>

      <label className="block">
        <span className="eyebrow">Когда начать — от этого момента считаются дни</span>
        <input
          className="input mt-1 w-full"
          type="datetime-local"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <span className="muted mt-1 block text-xs">
          Задания открываются на 1, 3, 5, 7, 9, 11 и 13 день. Ивент сам кончится через {days} дней.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <button className="btn-ghost" disabled={busy} onClick={() => apply(false)}>
              {confirm ? "Точно остановить?" : "Остановить ивент"}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => apply(true)}>
              Сдвинуть начало
            </button>
          </>
        ) : (
          <button className="btn" disabled={busy} onClick={() => apply(true)}>
            Запустить ивент
          </button>
        )}
      </div>

      {message && <p className="muted text-sm">{message}</p>}
    </div>
  );
}
