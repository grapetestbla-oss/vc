"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Действия над аккаунтом: наказания, баланс, выдача админки (только 5 уровень). */
export default function UserActions({
  userId,
  adminLevel,
}: {
  userId: string;
  adminLevel: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Готово" : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
  }

  return (
    <div className="mt-5 space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          call("/api/panel/punish", {
            type: form.get("type"),
            reason: form.get("reason"),
            minutes: Number(form.get("minutes") || 0),
            days: Number(form.get("days") || 0),
          });
        }}
      >
        <select name="type" className="input w-40">
          <option value="JAIL">Деморган</option>
          <option value="WARN">Варн</option>
          <option value="BAN">Бан</option>
        </select>
        <input name="reason" className="input w-64" placeholder="Причина" required />
        <input name="minutes" type="number" className="input w-28" placeholder="минут" />
        <input name="days" type="number" className="input w-28" placeholder="дней" />
        <button className="btn" disabled={busy}>Выдать</button>
      </form>

      {adminLevel >= 5 && (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              call("/api/panel/balance", {
                amount: Number(form.get("amount")),
                reason: form.get("reason"),
              });
            }}
          >
            <input name="amount" type="number" className="input w-32" placeholder="± VC" required />
            <input name="reason" className="input w-64" placeholder="Причина корректировки" required />
            <button className="btn-ghost" disabled={busy}>Изменить баланс</button>
          </form>

          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              call("/api/panel/staff", { level: Number(form.get("level")) });
            }}
          >
            <select name="level" className="input w-56">
              <option value="0">Снять админку</option>
              <option value="1">1 — media</option>
              <option value="2">2 — helper</option>
              <option value="3">3 — administrator</option>
              <option value="4">4 — pr assistant</option>
              <option value="5">5 — chief administrator</option>
            </select>
            <button className="btn-ghost" disabled={busy}>Назначить</button>
          </form>
        </>
      )}

      {message && <p className="muted text-sm">{message}</p>}
    </div>
  );
}
