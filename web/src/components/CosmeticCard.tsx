"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./LangProvider";
import { rarityColor, rarityLabel, KIND_LABEL } from "@/lib/rarity";

export default function CosmeticCard({
  item,
}: {
  item: {
    key: string;
    name: string;
    description: string;
    kind: string;
    rarity: string;
    owned: boolean;
    equipped: boolean;
    serial: number | null;
    serialLimit: number | null;
    shardPrice: number | null;
    obtainable: boolean;
  };
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const color = rarityColor(item.rarity);

  async function call(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? t("Ошибка"));
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="panel panel-hover flex h-full flex-col p-5"
      style={{ borderColor: item.owned ? `${color}55` : "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold" style={{ color: item.owned ? color : "var(--text)" }}>
            {item.name}
          </h3>
          <p className="muted text-xs">
            {t(rarityLabel(item.rarity))} · {t(KIND_LABEL[item.kind])}
            {item.serial && ` · #${item.serial}`}
          </p>
        </div>
        {item.serialLimit && (
          <span className="muted shrink-0 text-xs">{t("тираж")} {item.serialLimit}</span>
        )}
      </div>

      <p className="muted mt-3 flex-1 text-sm leading-6">{item.description}</p>

      <div className="mt-4">
        {item.owned ? (
          <button
            className={item.equipped ? "btn-ghost w-full" : "btn w-full"}
            disabled={busy}
            onClick={() => call("/api/cosmetics/equip", { key: item.key, equipped: !item.equipped })}
          >
            {item.equipped ? t("Снять") : t("Надеть")}
          </button>
        ) : item.shardPrice && item.obtainable ? (
          <button
            className="btn-ghost w-full"
            disabled={busy}
            onClick={() => call("/api/cosmetics/buy", { key: item.key })}
          >
            {t("Купить за {n} осколков", { n: item.shardPrice })}
          </button>
        ) : (
          <p className="muted text-center text-xs">
            {item.obtainable ? t("Выпадает только из кейсов") : t("Награда за коллекцию")}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 text-center text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
