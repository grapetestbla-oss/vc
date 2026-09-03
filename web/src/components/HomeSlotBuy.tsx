"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./LangProvider";

/**
 * Докупка точки дома. Цену считает сервер и присылает готовой: она зависит от
 * того, сколько точек уже куплено, и на витрине её подделать нельзя.
 */
export default function HomeSlotBuy({ priceVc }: { priceVc: number }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function buy() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/shop/home-slot", { method: "POST" });
    const data = await response.json();
    setBusy(false);
    setOk(response.ok);
    setMessage(
      response.ok ? t("Точка добавлена — отметьте её командой /sethome <имя>") : (data.error ?? t("Ошибка")),
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="mt-4">
      <button className="btn w-full" onClick={buy} disabled={busy}>
        {busy ? t("Покупаем…") : t("Купить за {n} VC", { n: priceVc.toLocaleString("ru") })}
      </button>
      {message && (
        <p className="mt-2 text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
          {message}
        </p>
      )}
    </div>
  );
}
