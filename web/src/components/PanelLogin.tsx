"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Повторный вход в панель: пароль и, если привязан, код из приложения. */
export default function PanelLogin({ totpEnabled }: { totpEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/panel/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.get("password"), code: form.get("code") }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    router.push("/panel");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="panel mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-xl font-bold">Вход в панель</h1>
      <p className="muted text-sm">
        Доступ подтверждается отдельно от сайта и действует 12 часов.
      </p>

      <label className="block space-y-1">
        <span className="muted text-sm">Пароль</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>

      {totpEnabled && (
        <label className="block space-y-1">
          <span className="muted text-sm">Код из приложения</span>
          <input
            name="code"
            inputMode="numeric"
            className="input font-mono tracking-widest"
            autoComplete="one-time-code"
            required
          />
        </label>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn w-full" disabled={busy}>
        {busy ? "…" : "Войти"}
      </button>

      {!totpEnabled && (
        <p className="muted text-xs">
          Двухфакторная защита панели не подключена. Включите её в разделе
          «Безопасность» сразу после входа.
        </p>
      )}
    </form>
  );
}
