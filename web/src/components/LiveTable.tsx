"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "./LangProvider";

export type Bet = {
  login: string;
  betVc: number;
  target: number;
  payoutVc: number;
  won: boolean;
  mine: boolean;
};

export type HistoryItem = {
  number: number;
  result: number | null;
  roll: number | null;
  serverSeed: string;
  serverSeedHash: string;
  at: number | null;
};

export type TableState = {
  now: number;
  enabled: boolean;
  round: {
    number: number;
    phase: "betting" | "resolving";
    startedAt: number;
    lockAt: number;
    endsAt: number;
    serverSeedHash: string;
    result: number | null;
    roll: number | null;
  };
  bets: Bet[];
  history: HistoryItem[];
  zones: { multiplier: number; until: number; chance?: number }[];
  balance: number | null;
};

/** Плашка вместо формы ставки, когда игра закрыта администрацией. */
export function DisabledNotice({ game }: { game: string }) {
  const t = useT();
  return (
    <div className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold" style={{ color: "var(--danger)" }}>
        {t("{game} временно выключена", { game: t(game) })}
      </h2>
      <p className="muted mt-2 text-sm">
        {t("Администрация закрыла игру — новые ставки не принимаются. Ставки, сделанные раньше, разыгрываются и выплачиваются как обычно.")}
      </p>
    </div>
  );
}

/**
 * Опрос стола. Раунды общие для всех, поэтому состояние приходит с сервера, а
 * не считается на клиенте: часы у игроков разные, а раунд один.
 */
export function useTable(game: "ROULETTE" | "CRASH") {
  const [state, setState] = useState<TableState | null>(null);
  // Разница между часами клиента и сервера: по ней считаем таймер без дрожания.
  const offset = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/live?game=${game}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as TableState;
      offset.current = data.now - Date.now();
      setState(data);
    } catch {
      // Сетевой сбой — просто ждём следующего опроса, стол не ломаем.
    }
  }, [game]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [load]);

  return { state, reload: load, serverNow: () => Date.now() + offset.current };
}

/** Секунды до конца фазы — тикают локально, чтобы не ждать следующего опроса. */
export function useCountdown(target: number, serverNow: () => number) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((target - serverNow()) / 1000)));
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [target, serverNow]);

  return left;
}

export function BetList({ bets, unit }: { bets: Bet[]; unit: string }) {
  const t = useT();
  const total = bets.reduce((sum, bet) => sum + bet.betVc, 0);

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("Ставки раунда")}</h2>
        <span className="muted text-sm tabular-nums">
          {bets.length} · {total.toLocaleString("ru")} VC
        </span>
      </div>

      {bets.length === 0 && <p className="muted mt-3 text-sm">{t("Пока никто не поставил.")}</p>}

      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
        {bets.map((bet, index) => (
          <div
            key={`${bet.login}-${index}`}
            className="flex items-baseline gap-3 rounded-lg px-2 py-1 text-sm"
            style={{ background: bet.mine ? "rgba(245,196,81,0.08)" : undefined }}
          >
            <span className="min-w-0 flex-1 truncate" style={{ color: bet.mine ? "var(--gold)" : undefined }}>
              {bet.login}
            </span>
            <span className="tabular-nums">{bet.betVc.toLocaleString("ru")} VC</span>
            {unit && (
              <span className="muted w-16 text-right tabular-nums">
                {unit}
                {bet.target}
              </span>
            )}
            <span
              className="w-20 text-right tabular-nums"
              style={{ color: bet.payoutVc > 0 ? "var(--gold)" : undefined }}
            >
              {bet.payoutVc > 0 ? `+${bet.payoutVc.toLocaleString("ru")}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function History({
  history,
  render,
}: {
  history: HistoryItem[];
  render: (item: HistoryItem) => { label: string; color: string };
}) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{t("Прошлые раунды")}</h2>
      <p className="muted mt-1 text-sm">
        {t("Нажмите на результат — покажем сид раунда, по нему результат пересчитывается вручную.")}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {history.map((item) => {
          const view = render(item);
          return (
            <button
              key={item.number}
              onClick={() => setOpen(open === item.number ? null : item.number)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums transition-transform hover:-translate-y-0.5"
              style={{ background: "rgba(255,255,255,0.05)", color: view.color }}
            >
              {view.label}
            </button>
          );
        })}
        {history.length === 0 && <span className="muted text-sm">{t("Раундов ещё не было.")}</span>}
      </div>

      {open !== null && (
        <div className="mt-4 space-y-1 break-all font-mono text-xs">
          {(() => {
            const item = history.find((entry) => entry.number === open);
            if (!item) return null;
            return (
              <>
                <div className="muted">{t("раунд")} #{item.number}</div>
                <div>{t("бросок:")} {item.roll?.toFixed(8)}</div>
                <div>server seed: {item.serverSeed}</div>
                <div className="muted">hash: {item.serverSeedHash}</div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
