"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetList, History, useCountdown, useTable } from "./LiveTable";

/** Цвет сектора: чем крупнее множитель, тем «дороже» он выглядит. */
function colorFor(multiplier: number): string {
  if (multiplier >= 10) return "#ff6b6b";
  if (multiplier >= 5) return "#c084fc";
  if (multiplier >= 3) return "#6ee7b7";
  if (multiplier >= 2) return "#f5c451";
  if (multiplier >= 1) return "#8ab4f8";
  if (multiplier >= 0.5) return "#5c6270";
  return "#3a3f4b";
}

/**
 * Колесо без «мимо»: каждый сектор что-то платит, просто чаще меньше ставки.
 * Бросок [0,1) — это угол, куда встанет стрелка, поэтому анимация показывает
 * ровно то, что посчитал сервер.
 */
export default function RouletteGame() {
  const router = useRouter();
  const { state, reload, serverNow } = useTable("ROULETTE");
  const [bet, setBet] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const left = useCountdown(
    state ? (state.round.phase === "betting" ? state.round.lockAt : state.round.endsAt) : 0,
    serverNow,
  );

  // Угол крутится всегда вперёд: назад колесо не отматывается.
  const spun = useRef(0);
  const [angle, setAngle] = useState(0);
  const shownRound = useRef<number | null>(null);

  useEffect(() => {
    if (!state || state.round.roll === null) return;
    if (shownRound.current === state.round.number) return;
    shownRound.current = state.round.number;
    // Только целое число оборотов: дробная часть сдвигала бы стрелку с сектора.
    spun.current += 4 + Math.floor(Math.random() * 2);
    setAngle(spun.current * 360 + state.round.roll * 360);
    router.refresh();
  }, [state, router]);

  async function place() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/games/live/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "ROULETTE", bet }),
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

  const zones = state.zones;
  const betting = state.round.phase === "betting";
  const mine = state.bets.find((item) => item.mine);

  // Сектора рисуем градиентом: конус из долей броска даёт ровно те же границы.
  const stops: string[] = [];
  let from = 0;
  for (const zone of zones) {
    stops.push(`${colorFor(zone.multiplier)} ${from * 360}deg ${zone.until * 360}deg`);
    from = zone.until;
  }

  return (
    <div className="space-y-5">
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="eyebrow">Раунд #{state.round.number}</p>
            <h2 className="mt-1 text-xl font-semibold">
              {betting ? `Ставки закроются через ${left} с` : `Результат · новый раунд через ${left} с`}
            </h2>
          </div>
          {state.round.result !== null && (
            <div className="text-right">
              <p className="eyebrow">Выпало</p>
              <p
                className="text-3xl font-bold tabular-nums"
                style={{ color: colorFor(state.round.result) }}
              >
                x{state.round.result}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <div className="relative" style={{ width: 260, height: 260 }}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(${stops.join(", ")})`,
                transform: `rotate(${-angle}deg)`,
                transition: "transform 4.5s cubic-bezier(0.12, 0.75, 0.1, 1)",
                boxShadow: "inset 0 0 0 6px rgba(0,0,0,0.35), 0 20px 60px -30px rgba(0,0,0,0.9)",
              }}
            />
            <div
              className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full text-center"
              style={{ background: "rgba(10,11,15,0.92)", border: "1px solid var(--border)" }}
            >
              <span className="eyebrow">бросок</span>
              <span className="text-lg font-semibold tabular-nums">
                {state.round.roll !== null ? state.round.roll.toFixed(4) : "…"}
              </span>
            </div>
            <div
              className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2"
              style={{
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "18px solid var(--gold)",
              }}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
          {zones.map((zone) => (
            <span key={zone.multiplier} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded"
                style={{ background: colorFor(zone.multiplier) }}
              />
              x{zone.multiplier}
              <span className="muted">{Math.round((zone.chance ?? 0) * 1000) / 10}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-36">
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

          <div className="flex gap-2">
            {[50, 100, 500].map((amount) => (
              <button
                key={amount}
                className="btn-ghost px-3 py-2 text-sm"
                onClick={() => setBet(amount)}
              >
                {amount}
              </button>
            ))}
          </div>

          <button className="btn" onClick={place} disabled={busy || !betting || Boolean(mine)}>
            {mine
              ? `Ставка принята: ${mine.betVc} VC`
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
          Множитель один на всех: выпавший сектор умножает ставку каждого. Пустых секторов нет —
          но в половине из них выплата меньше ставки.
        </p>
      </div>

      <BetList bets={state.bets} unit="" />

      <History
        history={state.history}
        render={(item) => ({
          label: `x${item.result}`,
          color: colorFor(item.result ?? 0),
        })}
      />
    </div>
  );
}
