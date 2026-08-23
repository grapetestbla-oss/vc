"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    if (data.promoError) {
      // Аккаунт создан, но код не подошёл — говорим об этом до перехода.
      setNotice(`Аккаунт создан, но промокод не принят: ${data.promoError}`);
      setTimeout(() => router.push("/cabinet"), 2500);
      router.refresh();
      return;
    }
    router.push(params.get("next") ?? "/cabinet");
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
        <>
          <label className="block space-y-1">
            <span className="muted text-sm">Почта</span>
            <input name="email" type="email" className="input" autoComplete="email" required />
          </label>

          <label className="block space-y-1">
            <span className="muted text-sm">Промокод — необязательно</span>
            <input
              name="promo"
              className="input font-mono uppercase"
              placeholder="код блогера"
              autoCapitalize="characters"
            />
            <span className="muted block text-xs">
              Вводится один раз при регистрации и навсегда остаётся за аккаунтом.
              Награда придёт, когда аккаунт дорастёт до третьего уровня.
            </span>
          </label>
        </>
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

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      {notice && <p className="text-sm" style={{ color: "var(--gold)" }}>{notice}</p>}

      <button className="btn w-full" disabled={busy}>
        {busy ? "…" : mode === "login" ? "Войти" : "Создать аккаунт"}
      </button>
    </form>
  );
}
