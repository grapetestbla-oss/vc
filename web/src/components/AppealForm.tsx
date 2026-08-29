"use client";

import { useState } from "react";
import { useT } from "./LangProvider";

export default function AppealForm() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (ok) {
    return (
      <div className="panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold" style={{ color: "var(--gold)" }}>
          {t("Заявление принято")}
        </h2>
        <p className="muted mt-2 text-sm">
          {t("Его рассмотрит главная администрация. Ответ придёт на указанный контакт — обычно в течение суток. Второе заявление по тому же нику подать нельзя, пока не будет решения.")}
        </p>
      </div>
    );
  }

  return (
    <form
      className="panel space-y-4 p-5 sm:p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage(null);
        const response = await fetch("/api/appeals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            login: form.get("login"),
            contact: form.get("contact"),
            text: form.get("text"),
          }),
        });
        const data = await response.json();
        setBusy(false);
        if (response.ok) setOk(true);
        else setMessage(data.error ?? t("Ошибка"));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">{t("Ник в игре")}</span>
          <input name="login" className="input mt-1 w-full" placeholder={t("Ник, который забанен")} required />
        </label>
        <label className="block">
          <span className="eyebrow">{t("Контакт для ответа")}</span>
          <input name="contact" className="input mt-1 w-full" placeholder={t("Telegram, Discord или почта")} required />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow">{t("Что произошло")}</span>
        <textarea
          name="text"
          className="input mt-1 h-40 w-full"
          placeholder={t("Когда и за что выдали бан, согласны ли вы с ним и почему считаете, что его стоит снять.")}
          required
        />
      </label>

      <div className="space-y-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
        <button className="btn w-full sm:w-auto" disabled={busy}>
          {busy ? t("Отправляем…") : t("Отправить заявление")}
        </button>
        {message && (
          <span className="block text-sm" style={{ color: "var(--danger)" }}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
