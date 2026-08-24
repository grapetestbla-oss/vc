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
    <div className="mt-4 space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0">
      <input
        className="input sm:min-w-48 sm:flex-1"
        placeholder="Комментарий к решению"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="btn flex-1 sm:flex-none"
          disabled={busy}
          onClick={() => decide("approve")}
        >
          Одобрить
        </button>
        <button
          className="btn-ghost flex-1 justify-center sm:flex-none"
          disabled={busy}
          onClick={() => decide("reject")}
        >
          Отклонить
        </button>
      </div>
      {message && <span className="muted block text-sm">{message}</span>}
    </div>
  );
}
