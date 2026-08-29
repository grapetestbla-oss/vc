"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPE_LABEL: Record<string, string> = {
  JAIL: "Деморган",
  WARN: "Варн",
  BAN: "Бан",
};

/** Строка наказания в карточке игрока: показывает и снимает. */
export default function PunishmentRow({
  id,
  type,
  reason,
  issuedAt,
  by,
  active,
  liftedAt,
  liftedBy,
  canLift,
}: {
  id: string;
  type: string;
  reason: string;
  issuedAt: string;
  by: string | null;
  active: boolean;
  liftedAt: string | null;
  liftedBy: string | null;
  /** Хватает ли уровня, чтобы снять именно это наказание. */
  canLift: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function lift() {
    if (!confirm) {
      setConfirm(true);
      setMessage("Нажмите ещё раз, чтобы снять");
      return;
    }
    setConfirm(false);
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/punish", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ punishmentId: id }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Снято" : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
  }

  return (
    <li className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span style={{ color: active ? "var(--danger)" : "var(--muted)" }}>
          {TYPE_LABEL[type] ?? type}
        </span>
        <span>{reason}</span>
        <span className="muted text-xs">
          {issuedAt}
          {by && ` · ${by}`}
          {!active && liftedAt && ` · снято ${liftedAt}${liftedBy ? ` (${liftedBy})` : ""}`}
        </span>
        {active && canLift && (
          <button
            className="btn-ghost ml-auto px-3 py-1 text-xs"
            style={{ color: "var(--gold)" }}
            disabled={busy}
            onClick={lift}
          >
            {confirm ? "Точно снять?" : "Снять"}
          </button>
        )}
      </div>
      {message && <p className="muted mt-1 text-xs">{message}</p>}
    </li>
  );
}
