"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MaintenanceToggle({
  enabled,
  reason,
  since,
}: {
  enabled: boolean;
  reason: string;
  since: number | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(reason || "Идут технические работы, скоро вернёмся");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function apply(next: boolean) {
    // Включение выкидывает всех с сервера, поэтому спрашиваем второй раз.
    if (next && !confirm) {
      setConfirm(true);
      setMessage("Нажмите ещё раз: всех игроков кикнет с сервера");
      return;
    }
    setConfirm(false);
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next, reason: text }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? (next ? "Техработы включены" : "Техработы выключены") : (data.error ?? "Ошибка"));
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
          ? `Техработы идут${since ? ` с ${new Date(since).toLocaleString("ru")}` : ""}. Сайт закрыт для всех, кроме 5 уровня, сервер никого не пускает.`
          : "Сайт и сервер работают в обычном режиме."}
      </div>

      <label className="block">
        <span className="eyebrow">Причина — её видят игроки на сайте и при кике</span>
        <input
          className="input mt-1 w-full"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <button className="btn" disabled={busy} onClick={() => apply(false)}>
            Выключить техработы
          </button>
        ) : (
          <button
            className="btn-ghost"
            style={{ color: "var(--danger)" }}
            disabled={busy}
            onClick={() => apply(true)}
          >
            {confirm ? "Точно включить?" : "Включить техработы"}
          </button>
        )}
        {enabled && (
          <button className="btn-ghost" disabled={busy} onClick={() => apply(true)}>
            Обновить причину
          </button>
        )}
      </div>

      {message && <p className="muted text-sm">{message}</p>}
    </div>
  );
}
