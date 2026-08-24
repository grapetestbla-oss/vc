"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Строка таблицы промокодов с правкой награды и уровня прямо на месте. */
export default function PromoRow({
  code,
  partner,
  rewardVc,
  requiredLevel,
  active,
  activations,
  editable,
}: {
  code: string;
  partner: string | null;
  rewardVc: number;
  requiredLevel: number;
  active: boolean;
  activations: number;
  editable: boolean;
}) {
  const router = useRouter();
  const [reward, setReward] = useState(rewardVc);
  const [level, setLevel] = useState(requiredLevel);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const changed = reward !== rewardVc || level !== requiredLevel;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/promo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, ...patch }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Сохранено" : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
  }

  return (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="py-2 font-mono">{code}</td>
      <td>{partner ?? "—"}</td>
      <td>
        {editable ? (
          <input
            type="number"
            className="input w-24 px-2 py-1"
            value={reward}
            onChange={(event) => setReward(Number(event.target.value))}
          />
        ) : (
          `${rewardVc} VC`
        )}
      </td>
      <td>
        {editable ? (
          <input
            type="number"
            className="input w-16 px-2 py-1"
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
          />
        ) : (
          requiredLevel
        )}
      </td>
      <td>{activations}</td>
      <td className="py-2">
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn px-3 py-1 text-xs"
              disabled={busy || !changed}
              onClick={() => save({ rewardVc: reward, requiredLevel: level })}
            >
              Сохранить
            </button>
            <button
              className="btn-ghost px-3 py-1 text-xs"
              disabled={busy}
              onClick={() => save({ active: !active })}
            >
              {active ? "Выключить" : "Включить"}
            </button>
            {message && <span className="muted text-xs">{message}</span>}
          </div>
        ) : (
          <span className="muted text-xs">{active ? "активен" : "выключен"}</span>
        )}
      </td>
    </tr>
  );
}
