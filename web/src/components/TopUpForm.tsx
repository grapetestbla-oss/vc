"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const METHODS = ["СБП", "Карта", "ЮMoney", "Крипта", "Другое"];

/** Готовые суммы в рублях: на телефоне это основной способ выбрать сумму. */
const PACKS = [100, 250, 500, 1000];

export default function TopUpForm({
  vcPerRub,
  minRub,
  maxRub,
  hasPending,
}: {
  vcPerRub: number;
  minRub: number;
  maxRub: number;
  hasPending: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(250);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (hasPending) {
    return (
      <div className="panel p-5 sm:p-6">
        <p className="muted text-sm">
          У вас уже есть заявка на рассмотрении. Дождитесь ответа администрации — новую можно
          создать после того, как эту одобрят или отклонят.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PACKS.map((rub) => {
          const active = amount === rub;
          return (
            <button
              key={rub}
              type="button"
              onClick={() => setAmount(rub)}
              className="panel panel-hover p-4 text-center transition-colors"
              style={active ? { borderColor: "var(--gold)" } : undefined}
            >
              <div className="text-xl font-semibold" style={{ color: "var(--gold)" }}>
                {(rub * vcPerRub).toLocaleString("ru")} VC
              </div>
              <div className="muted mt-1 text-sm">{rub} ₽</div>
            </button>
          );
        })}
      </div>

    <form
      className="panel space-y-4 p-5 sm:p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage(null);
        const response = await fetch("/api/payments/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountRub: amount,
            method: form.get("method"),
            contact: form.get("contact"),
            comment: form.get("comment"),
          }),
        });
        const data = await response.json();
        setBusy(false);
        setOk(response.ok);
        setMessage(
          response.ok
            ? `Заявка создана на ${data.vcAmount.toLocaleString("ru")} VC. Переведите ${data.amountRub} ₽ и ждите подтверждения.`
            : (data.error ?? "Ошибка"),
        );
        if (response.ok) router.refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Сумма, ₽</span>
          <input
            name="amountRub"
            type="number"
            inputMode="numeric"
            className="input mt-1 w-full"
            min={minRub}
            max={maxRub}
            step={10}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            required
          />
        </label>

        <div>
          <span className="eyebrow">Получите</span>
          <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--gold)" }}>
            {(Math.max(0, Math.floor(amount)) * vcPerRub).toLocaleString("ru")} VC
          </div>
        </div>

        <label className="block">
          <span className="eyebrow">Способ оплаты</span>
          <select name="method" className="input mt-1 w-full" required defaultValue={METHODS[0]}>
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eyebrow">Контакт для связи</span>
          <input
            name="contact"
            className="input mt-1 w-full"
            placeholder="Telegram, Discord или почта"
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow">Комментарий</span>
        <textarea
          name="comment"
          className="input mt-1 h-24 w-full"
          placeholder="Например: перевод с карты **** 1234 в 19:40"
        />
      </label>

      <div className="space-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
        <button className="btn w-full sm:w-auto" disabled={busy}>
          {busy ? "Отправляем…" : "Отправить заявку"}
        </button>
        {message && (
          <span
            className="block text-sm"
            style={{ color: ok ? "var(--gold)" : "var(--danger)" }}
          >
            {message}
          </span>
        )}
      </div>
    </form>
    </>
  );
}
