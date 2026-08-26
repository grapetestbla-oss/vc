"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetList, DisabledNotice, History, useCountdown, useTable } from "./LiveTable";

/** Сколько секунд длится сама анимация полёта внутри фазы показа. */
const FLIGHT_MS = 7000;

function colorFor(multiplier: number | null): string {
  if (multiplier === null) return "var(--muted)";
  if (multiplier < 1.5) return "#ff6b6b";
  if (multiplier < 3) return "#f5c451";
  if (multiplier < 10) return "#6ee7b7";
  return "#c084fc";
}

/**
 * Полёт ракеты. Точку краха сервер считает в момент закрытия ставок, поэтому
 * анимация просто проигрывает уже готовый результат — подсмотреть его и успеть
 * поставить нельзя, ставки к этому времени закрыты.
 */
export default function CrashGame() {
  const router = useRouter();
  const { state, reload, serverNow } = useTable("CRASH");
  const [bet, setBet] = useState(50);
  const [target, setTarget] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flight, setFlight] = useState(1);
  const frame = useRef<number | null>(null);
  const refreshed = useRef<number | null>(null);

  const left = useCountdown(
    state ? (state.round.phase === "betting" ? state.round.lockAt : state.round.endsAt) : 0,
    serverNow,
  );

  const crashAt = state?.round.result ?? null;
  const lockAt = state?.round.lockAt ?? 0;
  const roundNumber = state?.round.number ?? 0;

  // Множитель растёт от момента закрытия ставок — одинаково у всех, кто смотрит.
  useEffect(() => {
    if (crashAt === null) {
      setFlight(1);
      return;
    }
    const animate = () => {
      const passed = Math.max(0, serverNow() - lockAt);
      const progress = Math.min(1, passed / FLIGHT_MS);
      // Ускорение к концу: ракета «разгоняется», как в оригинале.
      setFlight(1 + (crashAt - 1) * Math.pow(progress, 1.6));
      if (progress < 1) frame.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [crashAt, lockAt, roundNumber, serverNow]);

  useEffect(() => {
    if (crashAt === null || refreshed.current === roundNumber) return;
    refreshed.current = roundNumber;
    router.refresh();
  }, [crashAt, roundNumber, router]);

  async function place() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/games/live/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "CRASH", bet, target }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) setError(data.error ?? "Ошибка");
    else {
      reload();
      router.refresh();
    }
  }

  if (!state) return <div className="panel muted p-6 text-sm">Подключаемся к столу…</div>;

  const betting = state.round.phase === "betting";
  const mine = state.bets.find((item) => item.mine);
  const exploded = crashAt !== null && flight >= crashAt - 0.001;
  const shown = crashAt === null ? null : Math.min(flight, crashAt);

  // Ракета летит по дуге: чем выше множитель, тем ближе к правому верхнему углу.
  const progress = crashAt === null ? 0 : Math.min(1, (flight - 1) / Math.max(0.01, crashAt - 1));
  const x = 8 + progress * 78;
  const y = 82 - Math.pow(progress, 0.85) * 66;

  return (
    <div className="space-y-5">
      <div className="panel overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="eyebrow">Раунд #{state.round.number}</p>
            <h2 className="mt-1 text-xl font-semibold">
              {betting ? `Старт через ${left} с` : exploded ? "Взрыв" : "Полёт"}
            </h2>
          </div>
          <div className="text-right">
            <p className="eyebrow">{exploded ? "Крах на" : "Множитель"}</p>
            <p
              className="text-4xl font-bold tabular-nums"
              style={{ color: exploded ? "#ff6b6b" : colorFor(shown) }}
            >
              {shown === null ? "—" : `x${shown.toFixed(2)}`}
            </p>
          </div>
        </div>

        <div
          className="relative mt-5 overflow-hidden rounded-xl"
          style={{
            height: 240,
            background:
              "linear-gradient(180deg, rgba(20,24,38,0.9), rgba(8,9,13,0.95)), radial-gradient(80% 60% at 20% 90%, rgba(245,196,81,0.12), transparent 70%)",
            border: "1px solid var(--border)",
          }}
        >
          {/* след ракеты */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path
              d={`M 8 82 Q ${8 + (x - 8) * 0.55} ${82 - (82 - y) * 0.25}, ${x} ${y}`}
              fill="none"
              stroke="rgba(245,196,81,0.55)"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div
            className="absolute text-2xl"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: `translate(-50%, -50%) rotate(${exploded ? 0 : -35}deg)`,
              filter: exploded ? "grayscale(0.4)" : "none",
              transition: "filter 0.3s ease",
            }}
          >
            {exploded ? "💥" : "🚀"}
          </div>

          {betting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="muted text-sm">Ракета готовится к старту…</span>
            </div>
          )}
        </div>
      </div>

      {state.enabled ? (
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-32">
            <span className="eyebrow">Ставка, VC</span>
            <input
              type="number"
              inputMode="numeric"
              className="input mt-1"
              value={bet}
              min={10}
              onChange={(event) => setBet(Math.max(0, Number(event.target.value)))}
            />
          </label>

          <label className="block w-32">
            <span className="eyebrow">Забрать на</span>
            <input
              type="number"
              step="0.01"
              className="input mt-1"
              value={target}
              min={1.01}
              onChange={(event) => setTarget(Number(event.target.value))}
            />
          </label>

          <button className="btn" onClick={place} disabled={busy || !betting || Boolean(mine)}>
            {mine
              ? `Ставка принята: ${mine.betVc} VC на x${mine.target}`
              : betting
                ? "Поставить"
                : "Ставки закрыты"}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <p className="muted mt-3 text-xs">
          Точка вывода выбирается заранее: ракета сама заберёт ставку на x{target || "…"}, если
          долетит.
        </p>
      </div>
      ) : (
        <DisabledNotice game="Краш" />
      )}

      <BetList bets={state.bets} unit="x" />

      <History
        history={state.history}
        render={(item) => ({
          label: `x${(item.result ?? 1).toFixed(2)}`,
          color: colorFor(item.result),
        })}
      />
    </div>
  );
}
