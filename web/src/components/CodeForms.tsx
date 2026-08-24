"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PromoForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/panel/promo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.get("code"),
            partnerLogin: form.get("partner"),
            rewardVc: Number(form.get("reward") || 1000),
            requiredLevel: Number(form.get("level") || 3),
          }),
        });
        const data = await response.json();
        setMessage(response.ok ? "Создан" : (data.error ?? "Ошибка"));
        if (response.ok) router.refresh();
      }}
    >
      <input name="code" className="input w-40" placeholder="КОД" required />
      <input name="partner" className="input w-40" placeholder="Логин партнёра" />
      <input name="reward" type="number" className="input w-28" defaultValue={1000} />
      <input name="level" type="number" className="input w-28" defaultValue={3} />
      <button className="btn">Создать промокод</button>
      {message && <span className="muted text-sm">{message}</span>}
    </form>
  );
}

export function BonusForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/panel/bonus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.get("code"),
            rewardVc: Number(form.get("reward")),
            maxUses: Number(form.get("uses")),
            expiresAt: form.get("expires") || null,
          }),
        });
        const data = await response.json();
        setMessage(response.ok ? "Создан" : (data.error ?? "Ошибка"));
        if (response.ok) router.refresh();
      }}
    >
      <input name="code" className="input w-40" placeholder="КОД" required />
      <input name="reward" type="number" className="input w-28" placeholder="VC" required />
      <input name="uses" type="number" className="input w-28" placeholder="использований" required />
      <input name="expires" type="datetime-local" className="input w-56" />
      <button className="btn">Создать бонус-код</button>
      {message && <span className="muted text-sm">{message}</span>}
    </form>
  );
}
