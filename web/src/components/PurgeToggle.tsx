"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Значение для input[type=datetime-local]: он понимает только местное время. */
function localInput(ms: number): string {
  const date = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export default function PurgeToggle({
  enabled,
  dropPercent,
  since,
  until,
}: {
  enabled: boolean;
  dropPercent: number;
  since: number | null;
  until: number | null;
}) {
  const router = useRouter();
  // По умолчанию предлагаем восемь часов вперёд: столько длится ночь.
  const [end, setEnd] = useState(localInput(until ?? Date.now() + 8 * 3600_000));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function apply(next: boolean) {
    // Включение отбирает у игроков VC, поэтому спрашиваем второй раз.
    if (next && !confirm) {
      setConfirm(true);
      setMessage(`Нажмите ещё раз: смерть начнёт стоить ${dropPercent}% баланса`);
      return;
    }
    setConfirm(false);
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next, until: next && end ? end : null }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(
      response.ok
        ? next
          ? "Судная ночь началась"
          : "Судная ночь закончена"
        : (data.error ?? "Ошибка"),
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          background: enabled ? "rgba(255,107,107,0.12)" : "rgba(255,255,255,0.04)",
          color: enabled ? "var(--danger)" : undefined,
        }}
      >
        {enabled
          ? `Судная ночь идёт${since ? ` с ${new Date(since).toLocaleString("ru")}` : ""}${
              until ? `, закончится ${new Date(until).toLocaleString("ru")}` : " до ручного выключения"
            }.`
          : "Обычная игра: ломать и ставить можно, смерть баланс не трогает."}
      </div>

      <label className="block">
        <span className="eyebrow">Когда закончить — режим выключится сам</span>
        <input
          className="input mt-1 w-full"
          type="datetime-local"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
        <span className="muted mt-1 block text-xs">
          Оставьте пустым, чтобы ночь шла до ручного выключения.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <button className="btn" disabled={busy} onClick={() => apply(false)}>
              Закончить судную ночь
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => apply(true)}>
              Обновить время окончания
            </button>
          </>
        ) : (
          <button
            className="btn-ghost"
            style={{ color: "var(--danger)" }}
            disabled={busy}
            onClick={() => apply(true)}
          >
            {confirm ? "Точно начать?" : "Начать судную ночь"}
          </button>
        )}
      </div>

      {message && <p className="muted text-sm">{message}</p>}
    </div>
  );
}
