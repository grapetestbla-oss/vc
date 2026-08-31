"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Восстановление пароля через Telegram-бота: код уходит туда, где человек уже
 * подтвердил, что владеет аккаунтом. Почту сайт не отправляет.
 */
export default function RecoverForm() {
  const [step, setStep] = useState<"login" | "code">("login");
  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Не получилось");
      return false;
    }
    return true;
  }

  if (done) {
    return (
      <div className="panel mx-auto max-w-md space-y-4 p-6">
        <h1 className="text-2xl font-bold">Пароль изменён</h1>
        <p className="muted text-sm">
          Старые сессии закрыты. Войдите с новым паролем — он же понадобится в игре для /login.
        </p>
        <Link href="/login" className="btn inline-block">
          Войти
        </Link>
      </div>
    );
  }

  return (
    <div className="panel mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Восстановление пароля</h1>

      {step === "login" ? (
        <>
          <p className="muted text-sm">
            Код придёт в Telegram-бота — тот, к которому привязан аккаунт. Если привязки нет,
            восстановить пароль самостоятельно не получится: напишите администрации.
          </p>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await send({ login })) setStep("code");
            }}
          >
            <label className="block">
              <span className="eyebrow">Логин</span>
              <input
                className="input mt-1 w-full"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <button className="btn w-full" disabled={busy}>
              {busy ? "…" : "Прислать код"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="muted text-sm">
            Если аккаунт существует и к нему привязан Telegram, бот прислал шестизначный код. Он
            действует 15 минут.
          </p>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await send({ login, code, password })) setDone(true);
            }}
          >
            <label className="block">
              <span className="eyebrow">Код из бота</span>
              <input
                className="input mt-1 w-full tracking-widest"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                required
              />
            </label>
            <label className="block">
              <span className="eyebrow">Новый пароль</span>
              <input
                className="input mt-1 w-full"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              <span className="muted mt-1 block text-xs">
                От 8 символов, буквы и цифры. Этот же пароль вводится в игре.
              </span>
            </label>
            <button className="btn w-full" disabled={busy}>
              {busy ? "…" : "Сменить пароль"}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => setStep("login")}
              disabled={busy}
            >
              Запросить код заново
            </button>
          </form>
        </>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <p className="muted text-center text-sm">
        <Link href="/login" className="underline hover:text-white">
          Вернуться ко входу
        </Link>
      </p>
    </div>
  );
}
