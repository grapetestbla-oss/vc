"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    router.push("/cabinet");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="panel mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-xl font-bold">
        {mode === "login" ? "Вход" : "Регистрация"}
      </h1>
      <p className="muted text-sm">
        Этот же логин и пароль используются для входа на сервере.
      </p>

      <label className="block space-y-1">
        <span className="muted text-sm">Логин (ник в игре)</span>
        <input name="login" className="input" autoComplete="username" required />
      </label>

      {mode === "register" && (
        <label className="block space-y-1">
          <span className="muted text-sm">Почта</span>
          <input name="email" type="email" className="input" autoComplete="email" required />
        </label>
      )}

      <label className="block space-y-1">
        <span className="muted text-sm">Пароль</span>
        <input
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn w-full" disabled={busy}>
        {busy ? "…" : mode === "login" ? "Войти" : "Создать аккаунт"}
      </button>
    </form>
  );
}
