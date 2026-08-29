"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./LangProvider";

export default function GiveawayJoin({
  giveawayId,
  hours,
  requiredHours,
  joined,
}: {
  giveawayId: string;
  hours: number;
  requiredHours: number;
  joined: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const enough = hours >= requiredHours;
  const left = Math.max(0, Math.round((requiredHours - hours) * 10) / 10);
  const progress = Math.min(100, Math.round((hours / Math.max(1, requiredHours)) * 100));

  return (
    <div className="mt-5 space-y-3">
      <div>
        <div className="flex justify-between text-xs">
          <span className="muted">
            наиграно {hours} ч из {requiredHours}
          </span>
          {!enough && <span className="muted">осталось {left} ч</span>}
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: enough ? "var(--gold)" : "rgba(245,196,81,0.45)",
            }}
          />
        </div>
      </div>

      {joined ? (
        <p className="text-sm" style={{ color: "var(--gold)" }}>
          Вы участвуете — ждём розыгрыша.
        </p>
      ) : (
        <div className="space-y-2 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
          <button
            className="btn w-full sm:w-auto"
            disabled={busy || !enough}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const response = await fetch("/api/giveaways", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ giveawayId }),
              });
              const data = await response.json();
              setBusy(false);
              setOk(response.ok);
              setMessage(response.ok ? t("Заявка принята") : (data.error ?? t("Ошибка")));
              if (response.ok) router.refresh();
            }}
          >
            {enough
              ? busy
                ? t("Отправляем…")
                : t("Участвовать")
              : t("Нужно ещё {n} ч", { n: left })}
          </button>
          {message && (
            <span className="block text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
