"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Flags = { ROULETTE: boolean; CRASH: boolean };

const GAMES: { key: keyof Flags; title: string; hint: string }[] = [
  { key: "ROULETTE", title: "Рулетка", hint: "Колесо на 41 сектор, раунд каждые 30 секунд" },
  { key: "CRASH", title: "Краш", hint: "Полёт ракеты с точкой вывода, раунд каждые 30 секунд" },
];

export default function GameToggles({ flags }: { flags: Flags }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(game: keyof Flags, enabled: boolean) {
    setBusy(game);
    setMessage(null);
    const response = await fetch("/api/panel/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, enabled }),
    });
    const data = await response.json();
    setBusy(null);
    setMessage(
      response.ok
        ? `${game === "ROULETTE" ? "Рулетка" : "Краш"}: ${enabled ? "открыта" : "выключена"}`
        : (data.error ?? "Ошибка"),
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      {GAMES.map((game) => {
        const enabled = flags[game.key];
        return (
          <div
            key={game.key}
            className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
            style={{
              background: enabled ? "rgba(255,255,255,0.04)" : "rgba(255,107,107,0.1)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">{game.title}</div>
              <div className="muted text-xs">{game.hint}</div>
            </div>

            <span
              className="text-sm"
              style={{ color: enabled ? "var(--gold)" : "var(--danger)" }}
            >
              {enabled ? "работает" : "выключена"}
            </span>

            <button
              className={enabled ? "btn-ghost" : "btn"}
              disabled={busy === game.key}
              onClick={() => toggle(game.key, !enabled)}
            >
              {busy === game.key ? "…" : enabled ? "Выключить" : "Включить"}
            </button>
          </div>
        );
      })}

      {message && <p className="muted text-sm">{message}</p>}

      <p className="muted text-xs">
        Выключение закрывает приём новых ставок. Уже сделанные ставки текущего раунда
        разыгрываются и выплачиваются как обычно — деньги игроков не зависают.
      </p>
    </div>
  );
}
