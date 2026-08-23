"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PARTNER_PLATFORMS } from "@/lib/partners";

export default function PartnerForm({ login }: { login: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done) {
    return (
      <div className="panel p-8 text-center">
        <h2 className="text-xl font-semibold" style={{ color: "var(--mint)" }}>
          Заявка отправлена
        </h2>
        <p className="muted mt-2 text-sm">
          Мы проверим охваты и вернёмся с ответом. Статус заявки виден в личном кабинете.
        </p>
      </div>
    );
  }

  return (
    <form
      className="panel space-y-4 p-8"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());

        const response = await fetch("/api/partners/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        setBusy(false);

        if (!response.ok) {
          setError(result.error ?? "Ошибка");
          return;
        }
        setDone(true);
        router.refresh();
      }}
    >
      <h2 className="text-xl font-semibold">Заявка от {login}</h2>

      <label className="block space-y-1">
        <span className="muted text-sm">Площадка</span>
        <select name="platform" className="input" required defaultValue="">
          <option value="" disabled>
            Выберите
          </option>
          {PARTNER_PLATFORMS.map((platform) => (
            <option key={platform.key} value={platform.key}>
              {platform.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="muted text-sm">Ссылка на канал</span>
        <input name="channelUrl" className="input" placeholder="https://" required />
      </label>

      <label className="block space-y-1">
        <span className="muted text-sm">Охваты</span>
        <textarea
          name="audience"
          className="input min-h-24"
          placeholder="Средние просмотры, зрители или участники за последние 7-30 дней"
          required
        />
        <span className="muted block text-xs">
          Скриншот аналитики попросим отдельно — сразу приложите ссылку, если он есть.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="muted text-sm">Контакт для связи</span>
        <input name="contact" className="input" placeholder="Telegram или Discord" required />
      </label>

      <label className="block space-y-1">
        <span className="muted text-sm">Желаемый промокод — необязательно</span>
        <input
          name="desiredCode"
          className="input font-mono uppercase"
          placeholder="ВАШ_КОД"
          maxLength={16}
        />
      </label>

      <label className="block space-y-1">
        <span className="muted text-sm">Комментарий — необязательно</span>
        <textarea name="comment" className="input min-h-20" />
      </label>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      <button className="btn w-full" disabled={busy}>
        {busy ? "Отправляем…" : "Отправить заявку"}
      </button>
    </form>
  );
}
