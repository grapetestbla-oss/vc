"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  state: string;
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number | null;
  diskMb: number;
  diskLimitMb: number | null;
  uptimeSec: number;
  name: string | null;
  address: string | null;
};

const STATE_LABEL: Record<string, string> = {
  running: "Работает",
  starting: "Запускается",
  stopping: "Останавливается",
  offline: "Выключен",
  unknown: "Неизвестно",
};

const STATE_COLOR: Record<string, string> = {
  running: "var(--gold)",
  starting: "var(--gold)",
  stopping: "var(--danger)",
  offline: "var(--danger)",
};

function uptime(seconds: number): string {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

export default function ServerControl({ configured }: { configured: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  // Остановка и перезапуск подтверждаются вторым нажатием: случайный клик
  // выкидывает с сервера всех, кто сейчас играет.
  const [confirm, setConfirm] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!configured) return;
    const response = await fetch("/api/panel/server");
    const data = await response.json();
    if (response.ok && data.status) {
      setStatus(data.status);
      setError(null);
    } else {
      setError(data.error ?? "Панель недоступна");
    }
  }, [configured]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function power(signal: string) {
    if ((signal === "stop" || signal === "restart" || signal === "kill") && confirm !== signal) {
      setConfirm(signal);
      setMessage("Нажмите ещё раз для подтверждения");
      return;
    }
    setConfirm(null);
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "power", signal }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Команда отправлена" : (data.error ?? "Ошибка"));
    setTimeout(refresh, 2000);
  }

  async function runCommand(event: React.FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "command", command }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? `Отправлено: ${command}` : (data.error ?? "Ошибка"));
    if (response.ok) setCommand("");
  }

  if (!configured) {
    return (
      <div className="panel p-6">
        <p className="muted text-sm">
          Управление сервером выключено. Задайте в <code>.env</code> переменные{" "}
          <code>GAME_PANEL_URL</code>, <code>GAME_PANEL_KEY</code> и{" "}
          <code>GAME_PANEL_SERVER_ID</code> и перезапустите сайт.
        </p>
      </div>
    );
  }

  const cards = status
    ? [
        { label: "Состояние", value: STATE_LABEL[status.state] ?? status.state, color: STATE_COLOR[status.state] },
        { label: "Аптайм", value: uptime(status.uptimeSec) },
        { label: "Процессор", value: `${status.cpuPercent} %` },
        {
          label: "Память",
          value: status.memoryLimitMb
            ? `${status.memoryMb} / ${status.memoryLimitMb} МБ`
            : `${status.memoryMb} МБ`,
        },
        {
          label: "Диск",
          value: status.diskLimitMb
            ? `${status.diskMb} / ${status.diskLimitMb} МБ`
            : `${status.diskMb} МБ`,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="panel p-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {status?.address && (
        <p className="muted text-sm">
          {status.name ?? "Сервер"} · адрес для игроков: <b>{status.address}</b>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="panel p-4">
            <div className="eyebrow">{card.label}</div>
            <div
              className="mt-2 text-lg font-semibold tabular-nums"
              style={card.color ? { color: card.color } : undefined}
            >
              {card.value}
            </div>
          </div>
        ))}
        {!status && !error && <div className="panel muted p-4 text-sm">Опрашиваем панель…</div>}
      </div>

      <div className="panel p-6">
        <p className="eyebrow">Питание</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" disabled={busy} onClick={() => power("start")}>
            Запустить
          </button>
          <button className="btn-ghost" disabled={busy} onClick={() => power("restart")}>
            {confirm === "restart" ? "Точно перезапустить?" : "Перезапустить"}
          </button>
          <button className="btn-ghost" disabled={busy} onClick={() => power("stop")}>
            {confirm === "stop" ? "Точно остановить?" : "Остановить"}
          </button>
          <button
            className="btn-ghost"
            style={{ color: "var(--danger)" }}
            disabled={busy}
            onClick={() => power("kill")}
          >
            {confirm === "kill" ? "Точно убить процесс?" : "Убить процесс"}
          </button>
        </div>
        <p className="muted mt-3 text-xs">
          «Убить процесс» не сохраняет мир — только если сервер завис и не отвечает на остановку.
        </p>
      </div>

      <form className="panel p-6" onSubmit={runCommand}>
        <p className="eyebrow">Консоль сервера</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="input min-w-64 flex-1 font-mono"
            placeholder="say Привет, сервер перезапустится через 5 минут"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            disabled={busy || status?.state !== "running"}
          />
          <button className="btn" disabled={busy || status?.state !== "running"}>
            Выполнить
          </button>
        </div>
        <p className="muted mt-3 text-xs">
          Команда уходит в консоль как от оператора сервера. Каждый вызов пишется в журнал панели.
        </p>
      </form>

      {message && <p className="muted text-sm">{message}</p>}
    </div>
  );
}
