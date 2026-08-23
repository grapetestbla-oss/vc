"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  item: { name: string; kind: string; rarity: string };
  rewardVc: number;
  balance: number;
};

export default function CaseOpener({ caseKey, price }: { caseKey: string; price: number }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/cases/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseKey }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Ошибка");
      return;
    }
    setResult(data);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button className="btn w-full" onClick={open} disabled={busy}>
        Открыть за {price} VC
      </button>
      {result && (
        <p className="text-sm">
          Выпало: <span style={{ color: "var(--gold)" }}>{result.item.name}</span>
          {result.rewardVc > 0 && ` (+${result.rewardVc} VC)`}
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
