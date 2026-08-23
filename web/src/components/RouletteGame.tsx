"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MULTIPLIERS = [2, 3, 5, 10];

export default function RouletteGame({ rtp }: { rtp: number }) {
  const router = useRouter();
  const [bet, setBet] = useState(50);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function play(multiplier: number) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/games/roulette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bet, multiplier }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    setLog((prev) =>
      [
        data.won
          ? `x${multiplier} — выигрыш ${data.payout} VC (баланс ${data.balance})`
          : `x${multiplier} — мимо, -${bet} VC (баланс ${data.balance})`,
        ...prev,
      ].slice(0, 12),
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-xs space-y-1">
        <span className="muted text-sm">Ставка, VC</span>
        <input
          type="number"
          className="input"
          value={bet}
          min={10}
          onChange={(event) => setBet(Math.max(0, Number(event.target.value)))}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        {MULTIPLIERS.map((multiplier) => (
          <button
            key={multiplier}
            className="btn"
            disabled={busy}
            onClick={() => play(multiplier)}
          >
            x{multiplier}
            <span className="ml-2 text-xs opacity-70">
              {((rtp / multiplier) * 100).toFixed(1)}%
            </span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <ul className="muted space-y-1 text-sm">
        {log.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
