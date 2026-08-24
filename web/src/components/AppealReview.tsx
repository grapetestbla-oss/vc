"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AppealReview({ appealId }: { appealId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/appeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appealId, approve, note }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(
      response.ok
        ? approve
          ? `Разбанен, снято наказаний: ${data.liftedBans}`
          : "Отказано"
        : (data.error ?? "Ошибка"),
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="mt-4 space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0">
      <input
        className="input sm:min-w-48 sm:flex-1"
        placeholder="Ответ игроку"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <button className="btn flex-1 sm:flex-none" disabled={busy} onClick={() => decide(true)}>
          Разбанить
        </button>
        <button
          className="btn-ghost flex-1 justify-center sm:flex-none"
          disabled={busy}
          onClick={() => decide(false)}
        >
          Отказать
        </button>
      </div>
      {message && <span className="muted block text-sm">{message}</span>}
    </div>
  );
}
