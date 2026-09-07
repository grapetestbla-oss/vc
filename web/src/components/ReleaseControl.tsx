"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Release = {
  id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  branch: string;
  seedCatalogue: boolean;
  restartGame: boolean;
  note: string;
  createdAt: string;
  finishedAt: string | null;
  log: string;
  requestedBy: { login: string };
};

const STATUS: Record<Release["status"], { label: string; color: string }> = {
  PENDING: { label: "в очереди", color: "var(--muted)" },
  RUNNING: { label: "идёт", color: "var(--gold)" },
  DONE: { label: "выкачено", color: "var(--mint)" },
  FAILED: { label: "не удалось", color: "var(--danger)" },
};

export default function ReleaseControl({
  allowed,
  logins,
  branch,
  agentReady,
  releases,
}: {
  allowed: boolean;
  logins: string[];
  branch: string;
  agentReady: boolean;
  releases: Release[];
}) {
  const router = useRouter();
  const [seedCatalogue, setSeedCatalogue] = useState(false);
  const [restartGame, setRestartGame] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [openLog, setOpenLog] = useState<string | null>(null);

  const busyRelease = releases.find(
    (release) => release.status === "PENDING" || release.status === "RUNNING",
  );

  async function publish() {
    // Кнопка меняет боевой сайт для всех — спрашиваем второй раз.
    if (!confirm) {
      setConfirm(true);
      setOk(false);
      setMessage("Нажмите ещё раз: основной сайт пересоберётся из ветки " + branch);
      return;
    }
    setConfirm(false);
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedCatalogue, restartGame, note }),
    });
    const data = await response.json();
    setBusy(false);
    setOk(response.ok);
    setMessage(
      response.ok ? "Выкатка поставлена в очередь — агент заберёт её в ближайшую минуту" : (data.error ?? "Ошибка"),
    );
    if (response.ok) {
      setNote("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      {!allowed && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--danger)" }}
        >
          Выкатывать может только {logins.join(", ")}. Вам доступна только история.
        </div>
      )}

      {!agentReady && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--danger)" }}
        >
          Агент выкатки не настроен: в <code>deploy/.env</code> нет DEPLOY_AGENT_TOKEN. Задача
          встанет в очередь и никем не будет взята.
        </div>
      )}

      {allowed && (
        <div className="space-y-4">
          <p className="muted text-sm">
            Ветка: <span style={{ color: "var(--gold)" }}>{branch}</span>
          </p>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={seedCatalogue}
              onChange={(event) => setSeedCatalogue(event.target.checked)}
            />
            <span>
              Прогнать каталог
              <span className="muted block text-xs">
                Косметика, кейсы и товары магазина. Нужно после правки цен и наборов. Вернёт к
                значениям из репозитория то, что меняли в панели магазина.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={restartGame}
              onChange={(event) => setRestartGame(event.target.checked)}
            />
            <span>
              Перезапустить игровой сервер
              <span className="muted block text-xs">
                Только перезапуск. Новый jar плагина заливается вручную при остановленном сервере —
                этого кнопка не делает.
              </span>
            </span>
          </label>

          <label className="block">
            <span className="eyebrow">Что выкатываем — видно в истории</span>
            <input
              className="input mt-1 w-full"
              value={note}
              maxLength={300}
              placeholder="например: цены кейсов и судная ночь"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <button
            className="btn-ghost"
            style={{ color: "var(--danger)" }}
            disabled={busy || Boolean(busyRelease)}
            onClick={publish}
          >
            {busyRelease
              ? "Предыдущая выкатка ещё идёт"
              : busy
                ? "Ставим в очередь…"
                : confirm
                  ? "Точно выкатить на боевой?"
                  : "Выкатить на основной сайт"}
          </button>

          {message && (
            <p className="text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
              {message}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-semibold">История</h2>
        {releases.length === 0 && <p className="muted text-sm">Выкаток ещё не было.</p>}
        {releases.map((release) => (
          <div
            key={release.id}
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span style={{ color: STATUS[release.status].color }}>
                {STATUS[release.status].label}
              </span>
              <span className="muted text-xs">
                {new Date(release.createdAt).toLocaleString("ru")} · {release.requestedBy.login}
              </span>
              {release.seedCatalogue && <span className="muted text-xs">каталог</span>}
              {release.restartGame && <span className="muted text-xs">перезапуск сервера</span>}
            </div>
            {release.note && <p className="mt-1">{release.note}</p>}
            {release.log && (
              <button
                className="muted mt-1 text-xs underline"
                onClick={() => setOpenLog(openLog === release.id ? null : release.id)}
              >
                {openLog === release.id ? "скрыть вывод" : "показать вывод"}
              </button>
            )}
            {openLog === release.id && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                {release.log}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
