"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./LangProvider";

const METHODS = ["СБП", "Карта", "ЮMoney", "Крипта", "Другое"];

/** Готовые суммы в рублях: на телефоне это основной способ выбрать сумму. */
const PACKS = [100, 250, 500, 1000];

export type ProviderOption = {
  key: string;
  title: string;
  hint: string;
  bonusPercent: number;
};

export default function TopUpForm({
  vcPerRub,
  minRub,
  maxRub,
  hasPending,
  providers,
}: {
  vcPerRub: number;
  minRub: number;
  maxRub: number;
  hasPending: boolean;
  /** Подключённые кассы: у каждой свой бонус к VC. */
  providers: ProviderOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [amount, setAmount] = useState(250);
  const [provider, setProvider] = useState(providers[0]?.key ?? "manual");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const current = providers.find((item) => item.key === provider) ?? providers[0];
  const auto = current?.key !== "manual";
  const bonusPercent = current?.bonusPercent ?? 0;
  const vcFor = (rub: number) => {
    const base = Math.floor(Math.max(0, rub) * vcPerRub);
    return base + Math.floor((base * bonusPercent) / 100);
  };

  if (providers.length === 0) {
    return (
      <div className="panel p-5 sm:p-6">
        <p className="muted text-sm">
          {t("Пополнение временно отключено. Загляните позже — кассы вернут, как только закончим настройку.")}
        </p>
      </div>
    );
  }

  if (hasPending && !auto) {
    return (
      <div className="panel p-5 sm:p-6">
        <p className="muted text-sm">
          {t("У вас уже есть заявка на рассмотрении. Дождитесь ответа администрации — новую можно создать после того, как эту одобрят или отклонят.")}
        </p>
      </div>
    );
  }

  return (
    <>
      {providers.length > 1 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {providers.map((item) => {
            const active = item.key === provider;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setProvider(item.key)}
                className="panel panel-hover p-4 text-left transition-colors"
                style={active ? { borderColor: "var(--gold)" } : undefined}
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{t(item.title)}</span>
                  {item.bonusPercent > 0 && (
                    <span className="text-sm" style={{ color: "var(--gold)" }}>
                      +{item.bonusPercent}% VC
                    </span>
                  )}
                </div>
                <div className="muted mt-1 text-sm">{t(item.hint)}</div>
              </button>
            );
          })}
        </div>
      )}

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
                {vcFor(rub).toLocaleString("ru")} VC
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
            provider,
            method: form.get("method"),
            contact: form.get("contact"),
            comment: form.get("comment"),
          }),
        });
        const data = await response.json();

        // Автоматическая оплата: уводим на страницу кассы, VC начислит
        // её уведомление — ждать администрацию не нужно.
        if (response.ok && data.payUrl) {
          window.location.href = data.payUrl;
          return;
        }

        setBusy(false);
        setOk(response.ok);
        setMessage(
          response.ok
            ? t("Заявка создана на {vc} VC. Переведите {rub} ₽ и ждите подтверждения.", {
                vc: data.vcAmount.toLocaleString("ru"),
                rub: data.amountRub,
              })
            : (data.error ?? t("Ошибка")),
        );
        if (response.ok) router.refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">{t("Сумма, ₽")}</span>
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
          <span className="eyebrow">{t("Получите")}</span>
          <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--gold)" }}>
            {vcFor(Math.floor(amount)).toLocaleString("ru")} VC
          </div>
          {bonusPercent > 0 && (
            <div className="muted text-xs">
              {t("включая бонус +{n}% за оплату через {provider}", {
                n: bonusPercent,
                provider: t(current?.title ?? ""),
              })}
            </div>
          )}
        </div>

        {!auto && (
        <label className="block">
          <span className="eyebrow">{t("Способ оплаты")}</span>
          <select name="method" className="input mt-1 w-full" required defaultValue={METHODS[0]}>
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        )}

        {!auto && (
        <label className="block">
          <span className="eyebrow">{t("Контакт для связи")}</span>
          <input
            name="contact"
            className="input mt-1 w-full"
            placeholder={t("Telegram, Discord или почта")}
            required
          />
        </label>
        )}
      </div>

      {!auto && (
        <label className="block">
          <span className="eyebrow">{t("Комментарий")}</span>
          <textarea
            name="comment"
            className="input mt-1 h-24 w-full"
            placeholder={t("Например: перевод с карты **** 1234 в 19:40")}
          />
        </label>
      )}

      <div className="space-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
        <button className="btn w-full sm:w-auto" disabled={busy}>
          {busy
            ? auto
              ? t("Переходим к оплате…")
              : t("Отправляем…")
            : auto
              ? t("Перейти к оплате")
              : t("Отправить заявку")}
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
