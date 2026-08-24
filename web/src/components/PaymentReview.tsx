"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PaymentReview({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, action, note }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(
      response.ok ? (action === "approve" ? "Начислено" : "Отклонено") : (data.error ?? "Ошибка"),
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <input
        className="input min-w-48 flex-1"
        placeholder="Комментарий к решению"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <button className="btn" disabled={busy} onClick={() => decide("approve")}>
        Одобрить
      </button>
      <button className="btn-ghost" disabled={busy} onClick={() => decide("reject")}>
        Отклонить
      </button>
      {message && <span className="muted text-sm">{message}</span>}
    </div>
  );
}
