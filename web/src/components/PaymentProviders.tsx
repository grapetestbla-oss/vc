"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = {
  name: string;
  label: string;
  hint?: string;
  /** Ключ: в поле показываем маску, пустое значение ничего не меняет. */
  secret?: boolean;
  placeholder?: string;
};

export type ProviderState = {
  key: "freekassa" | "platega" | "manual";
  title: string;
  hint: string;
  enabled: boolean | null;
  bonusPercent: number;
  ready: boolean;
  fields: Field[];
  values: Record<string, string>;
  callbackUrl?: string;
  docs?: string;
};

function Row({ state, vcPerRub }: { state: ProviderState; vcPerRub: number }) {
  const router = useRouter();
  // null у ручного приёма — «сам по себе»: показываем, когда касс нет.
  const [enabled, setEnabled] = useState<boolean | null>(state.enabled);
  const [bonus, setBonus] = useState(String(state.bonusPercent));
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const bonusNumber = Math.max(0, Number(bonus) || 0);
  const example = Math.floor(1000 * vcPerRub) + Math.floor((Math.floor(1000 * vcPerRub) * bonusNumber) / 100);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/payment/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: state.key, patch }),
    });
    const data = await response.json();
    setBusy(false);
    setOk(response.ok);
    setMessage(response.ok ? "Сохранено" : (data.error ?? "Ошибка"));
    if (response.ok) {
      setValues({});
      router.refresh();
    }
  }

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-lg font-semibold">{state.title}</h2>
          <p className="muted text-sm">{state.hint}</p>
        </div>
        <span
          className="text-sm"
          style={{ color: state.ready ? "var(--gold)" : "var(--danger)" }}
        >
          {state.ready
            ? "Работает"
            : enabled === false
              ? "Выключена"
              : enabled === null
                ? "Запасной путь"
                : "Не хватает ключей"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {state.fields.map((field) => (
          <label key={field.name} className="block">
            <span className="eyebrow">{field.label}</span>
            <input
              className="input mt-1 w-full"
              type={field.secret ? "password" : "text"}
              autoComplete="off"
              value={values[field.name] ?? ""}
              placeholder={
                state.values[field.name]
                  ? field.secret
                    ? `сохранено: ${state.values[field.name]}`
                    : state.values[field.name]
                  : (field.placeholder ?? "")
              }
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }
            />
            {field.hint && <span className="muted mt-1 block text-xs">{field.hint}</span>}
          </label>
        ))}

        <label className="block">
          <span className="eyebrow">Бонус к VC, %</span>
          <input
            className="input mt-1 w-full"
            type="number"
            min={0}
            max={500}
            step={1}
            value={bonus}
            onChange={(event) => setBonus(event.target.value)}
          />
          <span className="muted mt-1 block text-xs">
            1000 ₽ → <b style={{ color: "var(--gold)" }}>{example.toLocaleString("ru")} VC</b>
          </span>
        </label>
      </div>

      {state.callbackUrl && (
        <p className="muted mt-3 text-xs">
          Адрес уведомлений для кабинета кассы: <b>{state.callbackUrl}</b>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            save({
              bonusPercent: bonusNumber,
              ...(enabled === null ? {} : { enabled }),
              ...values,
            })
          }
        >
          Сохранить
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => {
            const next = enabled === false;
            setEnabled(next);
            save({ enabled: next });
          }}
        >
          {enabled === false ? "Включить" : "Выключить"}
        </button>
        {state.fields.some((field) => field.secret) && (
          <button
            className="btn-ghost"
            style={{ color: "var(--danger)" }}
            disabled={busy}
            onClick={() =>
              save(
                Object.fromEntries(
                  state.fields.filter((field) => field.secret).map((field) => [field.name, null]),
                ),
              )
            }
          >
            Стереть ключи
          </button>
        )}
        {message && (
          <span className="text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}

export default function PaymentProviders({
  providers,
  vcPerRub,
}: {
  providers: ProviderState[];
  vcPerRub: number;
}) {
  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <Row key={provider.key} state={provider} vcPerRub={vcPerRub} />
      ))}
    </div>
  );
}
