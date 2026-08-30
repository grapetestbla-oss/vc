"use client";

import { useCallback, useEffect, useState } from "react";
import { itemTitle, type InventoryItem } from "@/lib/inventory";

type Snapshot = {
  items: InventoryItem[];
  world: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  health: number | null;
  food: number | null;
  xpLevel: number | null;
  gameMode: string | null;
  takenAt: string;
};

const ARMOR_ORDER = ["helmet", "chestplate", "leggings", "boots"];
const ARMOR_LABEL: Record<string, string> = {
  helmet: "Шлем",
  chestplate: "Нагрудник",
  leggings: "Поножи",
  boots: "Ботинки",
};
const GAME_MODE: Record<string, string> = {
  SURVIVAL: "выживание",
  CREATIVE: "креатив",
  ADVENTURE: "приключение",
  SPECTATOR: "наблюдатель",
};

/** Полная подпись предмета — уходит в title ячейки, там же зачарования и износ. */
function describe(item: InventoryItem): string {
  const parts = [item.name ? `${item.name} (${itemTitle(item.type)})` : itemTitle(item.type)];
  if (item.amount > 1) parts.push(`× ${item.amount}`);
  if (item.enchants?.length) parts.push(item.enchants.join(", "));
  if (item.damage && item.maxDamage) {
    parts.push(`прочность ${item.maxDamage - item.damage} из ${item.maxDamage}`);
  }
  return parts.join(" · ");
}

function Cell({ item }: { item: InventoryItem | undefined }) {
  if (!item) {
    return (
      <div
        className="aspect-square rounded-md border"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      />
    );
  }

  const worn = item.damage && item.maxDamage ? 1 - item.damage / item.maxDamage : null;
  return (
    <div
      title={describe(item)}
      className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-md border p-1"
      style={{
        borderColor: item.enchants?.length ? "var(--gold)" : "var(--border-bright)",
        background: "var(--panel-strong)",
      }}
    >
      <span className="text-[9px] leading-tight break-words">
        {item.name ?? itemTitle(item.type)}
      </span>
      {item.amount > 1 && (
        <span className="self-end text-[10px] font-bold" style={{ color: "var(--gold)" }}>
          {item.amount}
        </span>
      )}
      {worn !== null && (
        <span
          className="absolute inset-x-1 bottom-0.5 h-0.5 rounded"
          style={{
            background: `linear-gradient(to right, var(--mint) ${worn * 100}%, transparent ${worn * 100}%)`,
          }}
        />
      )}
    </div>
  );
}

function Grid({ items, slots, from }: { items: InventoryItem[]; slots: number; from: number }) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {Array.from({ length: slots }, (_, index) => (
        <Cell key={from + index} item={items.find((item) => item.slot === from + index)} />
      ))}
    </div>
  );
}

/** Инвентарь игрока в карточке панели: слепок присылает плагин. */
export default function InventoryView({ userId }: { userId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/panel/inventory?userId=${userId}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error === "forbidden" ? "Нет права на просмотр инвентаря" : "Не загрузилось");
    } else {
      setSnapshot(data.snapshot);
      setPending(Boolean(data.pending));
      setError(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Пока поручение не забрал плагин, тихо перечитываем — слепок придёт сам.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function refresh() {
    setPending(true);
    const response = await fetch("/api/panel/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      setPending(false);
      setError("Не удалось запросить слепок");
    }
  }

  if (loading) return <p className="muted text-sm">Загрузка…</p>;
  if (error) return <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>;

  const items = snapshot?.items ?? [];
  const main = items.filter((item) => item.area === "main");
  const armor = items.filter((item) => item.area === "armor");
  const offhand = items.find((item) => item.area === "offhand");
  const ender = items.filter((item) => item.area === "ender");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={refresh} disabled={pending}>
          {pending ? "Ждём игрока…" : "Обновить"}
        </button>
        {snapshot ? (
          <span className="muted text-sm">
            слепок от {new Date(snapshot.takenAt).toLocaleString("ru")}
          </span>
        ) : (
          <span className="muted text-sm">
            слепка ещё нет — он появится, когда игрок будет в сети
          </span>
        )}
      </div>

      {snapshot && (
        <>
          <p className="muted text-sm">
            {snapshot.world ?? "—"}
            {snapshot.x !== null && ` · ${snapshot.x} ${snapshot.y} ${snapshot.z}`}
            {snapshot.health !== null && ` · ❤ ${snapshot.health}`}
            {snapshot.food !== null && ` · 🍗 ${snapshot.food}`}
            {snapshot.xpLevel !== null && ` · опыт ${snapshot.xpLevel}`}
            {snapshot.gameMode &&
              ` · ${GAME_MODE[snapshot.gameMode] ?? snapshot.gameMode.toLowerCase()}`}
          </p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px]">
            <div className="space-y-3">
              <div>
                <h3 className="muted mb-1 text-xs uppercase">Рюкзак</h3>
                <Grid items={main} slots={27} from={9} />
              </div>
              <div>
                <h3 className="muted mb-1 text-xs uppercase">Быстрый доступ</h3>
                <Grid items={main} slots={9} from={0} />
              </div>
            </div>

            <div>
              <h3 className="muted mb-1 text-xs uppercase">На игроке</h3>
              <div className="grid grid-cols-2 gap-1">
                {ARMOR_ORDER.map((label) => {
                  const item = armor.find((entry) => entry.label === label);
                  return (
                    <div key={label}>
                      <Cell item={item} />
                      <span className="muted block text-center text-[10px]">
                        {ARMOR_LABEL[label]}
                      </span>
                    </div>
                  );
                })}
                <div>
                  <Cell item={offhand} />
                  <span className="muted block text-center text-[10px]">Вторая рука</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="muted mb-1 text-xs uppercase">Эндер-сундук</h3>
            <Grid items={ender} slots={27} from={0} />
          </div>

          {items.length === 0 && <p className="muted text-sm">Инвентарь пуст.</p>}
        </>
      )}
    </div>
  );
}
