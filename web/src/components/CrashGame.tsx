"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CrashGame() {
  const router = useRouter();
  const [bet, setBet] = useState(50);
  const [cashOutAt, setCashOutAt] = useState(2);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function play() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/games/crash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bet, cashOutAt }),
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
          ? `Краш на x${data.crashPoint} — забрали на x${cashOutAt}, +${data.payout} VC`
          : `Краш на x${data.crashPoint} — не дотянул до x${cashOutAt}, -${bet} VC`,
        ...prev,
      ].slice(0, 12),
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="block w-40 space-y-1">
          <span className="muted text-sm">Ставка, VC</span>
          <input
            type="number"
            className="input"
            value={bet}
            min={10}
            onChange={(event) => setBet(Math.max(0, Number(event.target.value)))}
          />
        </label>
        <label className="block w-40 space-y-1">
          <span className="muted text-sm">Забрать на</span>
          <input
            type="number"
            step="0.01"
            className="input"
            value={cashOutAt}
            min={1.01}
            onChange={(event) => setCashOutAt(Number(event.target.value))}
          />
        </label>
      </div>

      <button className="btn" onClick={play} disabled={busy}>
        Играть
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <ul className="muted space-y-1 text-sm">
        {log.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
