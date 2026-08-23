"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rarityColor, rarityLabel, KIND_LABEL } from "@/lib/rarity";

type Slot = {
  id: string;
  label: string;
  rarity: string;
  kind: string | null;
};

type OpenResponse = {
  kind: "VC" | "SHARDS" | "COSMETIC";
  amount: number;
  cosmetic: { key: string; name: string; rarity: string; kind: string } | null;
  duplicate: boolean;
  serial: number | null;
  fromPity: boolean;
  balanceVc: number;
  shards: number;
  pity: { current: number; threshold: number };
  collectionRewards: string[];
  error?: string;
};

const CARD_WIDTH = 120;
const CARD_GAP = 12;
const STEP = CARD_WIDTH + CARD_GAP;
const WINNER_INDEX = 38;

/** Лента прокрутки: длинная строка предметов, финиш — выпавший. */
function buildStrip(slots: Slot[], winner: Slot): Slot[] {
  const strip: Slot[] = [];
  for (let i = 0; i < 44; i++) {
    strip.push(slots[Math.floor(Math.random() * slots.length)]);
  }
  strip[WINNER_INDEX] = winner; // позиция под указателем после прокрутки
  return strip;
}

export default function CaseOpener({
  caseKey,
  price,
  free,
  freeUsed,
  slots,
  pity,
}: {
  caseKey: string;
  price: number;
  free: boolean;
  freeUsed: boolean;
  slots: Slot[];
  pity: { current: number; threshold: number } | null;
}) {
  const router = useRouter();
  const [strip, setStrip] = useState<Slot[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<OpenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const track = useRef<HTMLDivElement>(null);

  async function open() {
    setError(null);
    setResult(null);
    setSpinning(true);

    const response = await fetch("/api/cases/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseKey }),
    });
    const data: OpenResponse = await response.json();

    if (!response.ok) {
      setSpinning(false);
      setError(data.error ?? "Ошибка");
      return;
    }

    const winner: Slot = data.cosmetic
      ? {
          id: data.cosmetic.key,
          label: data.cosmetic.name,
          rarity: data.cosmetic.rarity,
          kind: data.cosmetic.kind,
        }
      : {
          id: "reward",
          label: data.kind === "VC" ? `${data.amount} VC` : `${data.amount} осколков`,
          rarity: "common",
          kind: null,
        };

    const built = buildStrip(slots.length ? slots : [winner], winner);
    setStrip(built);
    setOffset(0);

    // Считаем от реальной ширины контейнера, чтобы карточка встала точно под
    // указателем на любом экране. Небольшой сдвиг внутри карточки — чтобы
    // остановка не выглядела механически ровной.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const width = track.current?.clientWidth ?? 600;
        const jitter = (Math.random() - 0.5) * (CARD_WIDTH * 0.5);
        setOffset(WINNER_INDEX * STEP + CARD_WIDTH / 2 - width / 2 + jitter);
      });
    });

    timer.current = setTimeout(() => {
      setSpinning(false);
      setResult(data);
      router.refresh();
    }, 4200);
  }

  return (
    <div className="space-y-4">
      {strip && (
        <div
          ref={track}
          className="relative overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.35)" }}
        >
          <div
            className="absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2"
            style={{ background: "var(--gold)", boxShadow: "0 0 12px var(--gold)" }}
          />
          <div
            className="flex gap-3 p-3"
            style={{
              transform: `translateX(${-offset}px)`,
              transition: offset ? "transform 4s cubic-bezier(0.15, 0.85, 0.2, 1)" : "none",
            }}
          >
            {strip.map((slot, index) => (
              <div
                key={`${slot.id}-${index}`}
                className="flex h-24 shrink-0 flex-col justify-end rounded-lg p-2 text-xs"
                style={{
                  width: CARD_WIDTH,
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${rarityColor(slot.rarity)}44`,
                  boxShadow: `inset 0 -24px 30px -24px ${rarityColor(slot.rarity)}`,
                }}
              >
                <span style={{ color: rarityColor(slot.rarity) }}>{slot.label}</span>
                {slot.kind && <span className="muted">{KIND_LABEL[slot.kind]}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && !spinning && (
        <div
          className="fade-up rounded-xl p-4"
          style={{
            border: `1px solid ${rarityColor(result.cosmetic?.rarity ?? "common")}66`,
            background: `${rarityColor(result.cosmetic?.rarity ?? "common")}12`,
          }}
        >
          {result.cosmetic ? (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className="text-lg font-semibold"
                  style={{ color: rarityColor(result.cosmetic.rarity) }}
                >
                  {result.cosmetic.name}
                </span>
                <span className="muted text-xs">
                  {rarityLabel(result.cosmetic.rarity)} · {KIND_LABEL[result.cosmetic.kind]}
                </span>
                {result.serial && (
                  <span className="text-xs" style={{ color: "var(--gold)" }}>
                    экземпляр #{result.serial}
                  </span>
                )}
              </div>
              {result.duplicate && (
                <p className="muted mt-1 text-sm">
                  Дубль — начислено {result.amount} осколков.
                </p>
              )}
              {result.fromPity && (
                <p className="mt-1 text-sm" style={{ color: "var(--gold)" }}>
                  Сработал гарант.
                </p>
              )}
            </>
          ) : (
            <span className="text-lg font-semibold">
              {result.kind === "VC" ? `+${result.amount} VC` : `+${result.amount} осколков`}
            </span>
          )}

          {result.collectionRewards.length > 0 && (
            <p className="mt-2 text-sm" style={{ color: "var(--mint)" }}>
              Коллекция собрана — награда добавлена в инвентарь.
            </p>
          )}
        </div>
      )}

      {pity && pity.threshold > 0 && (
        <div>
          <div className="flex justify-between text-xs">
            <span className="muted">Гарант легендарки</span>
            <span className="muted tabular-nums">
              {pity.current} / {pity.threshold}
            </span>
          </div>
          <div
            className="mt-1 h-1 overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${Math.min(100, (pity.current / pity.threshold) * 100)}%`,
                background: "linear-gradient(90deg, var(--gold), #fff2c4)",
              }}
            />
          </div>
        </div>
      )}

      <button
        className="btn w-full"
        onClick={open}
        disabled={spinning || (free && (freeUsed || Boolean(result)))}
      >
        {spinning
          ? "Открываем…"
          : free
            ? freeUsed || result
              ? "Следующий ящик — завтра"
              : "Открыть бесплатно"
            : `Открыть за ${price} VC`}
      </button>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
