"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TotpSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setMessage(null);
    const response = await fetch("/api/panel/totp", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Ошибка");
      return;
    }
    setSecret(data.secret);
    setOtpauth(data.otpauth);
  }

  async function send(method: "PUT" | "DELETE", code: string) {
    const response = await fetch("/api/panel/totp", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Готово" : (data.error ?? "Ошибка"));
    if (response.ok) {
      setSecret(null);
      setOtpauth(null);
      router.refresh();
    }
  }

  if (enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-green-400">Двухфакторная защита панели включена.</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send("DELETE", String(new FormData(event.currentTarget).get("code")));
          }}
        >
          <input name="code" className="input w-40 font-mono" placeholder="код" required />
          <button className="btn-ghost">Отключить</button>
        </form>
        {message && <p className="muted text-sm">{message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!secret && (
        <button className="btn" onClick={start}>
          Подключить приложение
        </button>
      )}

      {secret && (
        <>
          <p className="text-sm">
            Секрет: <span className="font-mono">{secret}</span>
          </p>
          <p className="muted text-xs break-all">
            Или добавьте ссылкой: {otpauth}
          </p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send("PUT", String(new FormData(event.currentTarget).get("code")));
            }}
          >
            <input name="code" className="input w-40 font-mono" placeholder="код из приложения" required />
            <button className="btn">Подтвердить</button>
          </form>
        </>
      )}

      {message && <p className="muted text-sm">{message}</p>}
    </div>
  );
}
