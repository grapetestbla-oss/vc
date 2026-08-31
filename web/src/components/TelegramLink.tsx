"use client";

import { useEffect, useState } from "react";

type Linked = { username: string | null; linkedAt: string } | null;

/** Привязка Telegram: код живёт 15 минут, ссылка открывает бота с ним. */
export default function TelegramLink() {
  const [linked, setLinked] = useState<Linked>(null);
  const [code, setCode] = useState<{ code: string; url: string; minutes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/tg/link")
      .then((response) => response.json())
      .then((data) => setLinked(data.linked ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function issue() {
    setBusy(true);
    const response = await fetch("/api/tg/link", { method: "POST" });
    if (response.ok) setCode(await response.json());
    setBusy(false);
  }

  async function unlink() {
    setBusy(true);
    await fetch("/api/tg/link", { method: "DELETE" });
    setLinked(null);
    setCode(null);
    setBusy(false);
  }

  if (!loaded) return <p className="muted text-sm">Загрузка…</p>;

  if (linked) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          Привязан{linked.username ? ` — @${linked.username}` : ""}
        </span>
        <button className="btn-ghost" onClick={unlink} disabled={busy}>
          Отвязать
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {code ? (
        <div className="space-y-2">
          <p className="text-sm">
            Код: <b className="tracking-widest">{code.code}</b>
          </p>
          <p className="muted text-xs">Действует {code.minutes} минут.</p>
          <a className="btn inline-block" href={code.url} target="_blank" rel="noreferrer">
            Открыть бота
          </a>
        </div>
      ) : (
        <button className="btn" onClick={issue} disabled={busy}>
          {busy ? "Готовим код…" : "Привязать Telegram"}
        </button>
      )}
    </div>
  );
}
