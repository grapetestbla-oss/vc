"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Действия над аккаунтом: наказания, баланс, выдача админки (только 5 уровень). */
export default function UserActions({
  userId,
  login,
  adminLevel,
  ranks = [],
}: {
  userId: string;
  login: string;
  adminLevel: number;
  /** Список рангов из панели: он может быть длиннее пяти встроенных. */
  ranks?: { level: number; title: string }[];
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
              {ranks.map((rank) => (
                <option key={rank.level} value={rank.level}>
                  {rank.level} — {rank.title}
                </option>
              ))}
            </select>
            <button className="btn-ghost" disabled={busy}>Назначить</button>
          </form>

          <PasswordForm userId={userId} login={login} />
          <WipeForm userId={userId} login={login} />
        </>
      )}

      {message && <p className="muted text-sm">{message}</p>}
    </div>
  );
}

/**
 * Выдача нового пароля.
 *
 * Действующий пароль не показать ни при каких правах: в базе argon2-хеш, а не
 * пароль. Поэтому помогаем иначе — выдаём новый и показываем его один раз тому,
 * кто выдал. Игрока это выкидывает из аккаунта, так что ник вводится руками.
 */
function PasswordForm({ userId, login }: { userId: string; login: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost text-sm" onClick={() => setOpen(true)}>
        Выдать новый пароль
      </button>
    );
  }

  if (issued) {
    return (
      <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm">
          Новый пароль для <b>{login}</b>:
        </p>
        <p className="select-all font-mono text-lg tracking-wide" style={{ color: "var(--gold)" }}>
          {issued}
        </p>
        <p className="muted text-xs">
          Показывается один раз — сохраните сейчас. Он же вводится в игре командой /login.
          Все прежние сессии игрока закрыты, а если у него привязан Telegram, бот уже
          сообщил о смене.
        </p>
        <button
          className="btn-ghost text-sm"
          onClick={() => {
            setIssued(null);
            setOpen(false);
          }}
        >
          Скрыть
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      style={{ borderColor: "var(--border)" }}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage(null);
        const response = await fetch("/api/panel/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, confirm: form.get("confirm") }),
        });
        const data = await response.json();
        setBusy(false);
        if (response.ok) setIssued(data.password);
        else setMessage(data.error ?? "Ошибка");
      }}
    >
      <p className="muted text-sm">
        Игрок выйдет из аккаунта на сайте и не войдёт в игру старым паролем. Действие
        записывается в журнал.
      </p>
      <input name="confirm" className="input w-full" placeholder={`Впишите ник ${login}`} required />
      <div className="flex gap-2">
        <button className="btn" disabled={busy}>
          {busy ? "…" : "Выдать пароль"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
      {message && <p className="text-sm" style={{ color: "var(--danger)" }}>{message}</p>}
    </form>
  );
}

/**
 * Обнуление аккаунта: баланс, осколки, время игры, косметика, кейсы, покупки —
 * всё в ноль, инвентарь в игре чистит плагин. Действие необратимо, поэтому
 * ник подтверждения вводится руками и лежит в отдельном блоке.
 */
function WipeForm({ userId, login }: { userId: string; login: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!open) {
    return (
      <button className="btn-ghost text-sm" style={{ color: "var(--danger)" }} onClick={() => setOpen(true)}>
        Обнулить аккаунт
      </button>
    );
  }

  return (
    <form
      className="panel space-y-3 p-4"
      style={{ borderColor: "rgba(255,107,107,0.35)" }}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage(null);
        const response = await fetch("/api/panel/wipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            reason: form.get("reason"),
            confirm: form.get("confirm"),
            clearInventory: form.get("inventory") === "on",
          }),
        });
        const data = await response.json();
        setBusy(false);
        setOk(response.ok);
        setMessage(
          response.ok
            ? `Обнулено: косметики ${data.cosmetics}, кейсов ${data.openings}, ставок ${data.rounds}, покупок ${data.purchases}`
            : (data.error ?? "Ошибка"),
        );
        if (response.ok) router.refresh();
      }}
    >
      <p className="text-sm" style={{ color: "var(--danger)" }}>
        Обнуление необратимо: сгорят баланс, осколки, наигранное время, косметика, история кейсов,
        ставок и покупок магазина. Наказания и журнал останутся.
      </p>

      <input name="reason" className="input" placeholder="Причина обнуления" required />
      <input name="confirm" className="input" placeholder={`Впишите ник ${login}`} required />

      <label className="flex items-center gap-2 text-sm">
        <input name="inventory" type="checkbox" defaultChecked />
        Очистить инвентарь в игре
      </label>

      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy}>
          {busy ? "Обнуляем…" : "Обнулить"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>

      {message && (
        <p className="text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
          {message}
        </p>
      )}
    </form>
  );
}
