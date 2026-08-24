"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ShopBuy({
  itemKey,
  priceVc,
  disabled,
  hint,
}: {
  itemKey: string;
  priceVc: number;
  disabled: boolean;
  hint: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function buy() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/shop/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: itemKey }),
    });
    const data = await response.json();
    setBusy(false);
    setOk(response.ok);
    setMessage(response.ok ? "Куплено — команда уже работает в игре" : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
  }

  return (
    <div className="mt-4">
      <button className="btn w-full" onClick={buy} disabled={busy || disabled}>
        {disabled ? (hint ?? "Недоступно") : busy ? "Покупаем…" : `Купить за ${priceVc.toLocaleString("ru")} VC`}
      </button>
      {message && (
        <p className="mt-2 text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
          {message}
        </p>
      )}
    </div>
  );
}
