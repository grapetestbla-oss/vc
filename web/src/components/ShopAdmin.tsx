"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminShopItem = {
  key: string;
  title: string;
  description: string;
  category: string;
  priceVc: number;
  kind: string;
  charges: number;
  feature: string;
  extra: string;
  requiredLevel: number;
  sort: number;
  active: boolean;
  buyers: number;
  boughtTimes: number;
  earnedVc: number;
};

const CATEGORIES = ["teleport", "utility", "insurance"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

/** Общие поля товара — одинаковые при создании и при правке. */
function Editor({
  value,
  onChange,
  features,
}: {
  value: AdminShopItem;
  onChange: (patch: Partial<AdminShopItem>) => void;
  features: string[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Название">
        <input
          className="input mt-1 w-full"
          value={value.title}
          maxLength={60}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </Field>

      <Field label="Цена, VC">
        <input
          type="number"
          min={0}
          className="input mt-1 w-full"
          value={value.priceVc}
          onChange={(event) => onChange({ priceVc: Number(event.target.value) })}
        />
      </Field>

      <Field label="Описание" hint="Его видят игроки на витрине">
        <textarea
          className="input mt-1 h-24 w-full"
          value={value.description}
          maxLength={400}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Раздел">
          <input
            className="input mt-1 w-full"
            list="shop-categories"
            value={value.category}
            onChange={(event) => onChange({ category: event.target.value })}
          />
        </Field>

        <Field label="Возможность" hint="Её ищет плагин">
          <input
            className="input mt-1 w-full"
            list="shop-features"
            value={value.feature}
            onChange={(event) => onChange({ feature: event.target.value })}
          />
        </Field>

        <Field label="Тип">
          <select
            className="input mt-1 w-full"
            value={value.kind}
            onChange={(event) => onChange({ kind: event.target.value })}
          >
            <option value="CHARGES">С зарядами</option>
            <option value="PERMANENT">Навсегда</option>
          </select>
        </Field>

        <Field label="Использований за покупку">
          <input
            type="number"
            min={1}
            className="input mt-1 w-full"
            value={value.kind === "PERMANENT" ? 0 : value.charges}
            disabled={value.kind === "PERMANENT"}
            onChange={(event) => onChange({ charges: Number(event.target.value) })}
          />
        </Field>

        <Field label="Нужный уровень">
          <input
            type="number"
            min={0}
            max={10}
            className="input mt-1 w-full"
            value={value.requiredLevel}
            onChange={(event) => onChange({ requiredLevel: Number(event.target.value) })}
          />
        </Field>

        <Field label="Порядок на витрине">
          <input
            type="number"
            min={0}
            className="input mt-1 w-full"
            value={value.sort}
            onChange={(event) => onChange({ sort: Number(event.target.value) })}
          />
        </Field>
      </div>

      <Field
        label="Доп. настройки, JSON"
        hint='Необязательно. Например: {"cooldownSeconds": 1800}'
      >
        <textarea
          className="input mt-1 h-24 w-full font-mono text-xs"
          value={value.extra}
          onChange={(event) => onChange({ extra: event.target.value })}
        />
      </Field>

      <datalist id="shop-categories">
        {CATEGORIES.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <datalist id="shop-features">
        {features.map((feature) => (
          <option key={feature} value={feature} />
        ))}
      </datalist>
    </div>
  );
}

function payloadOf(item: AdminShopItem) {
  const extra = item.extra.trim();
  return extra ? extra : "{}";
}

function Row({ item, features }: { item: AdminShopItem; features: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(item);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);

  async function send(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/shop", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: item.key, ...body }),
    });
    const data = await response.json();
    setBusy(false);
    setOk(response.ok);
    setMessage(response.ok ? "Сохранено" : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
  }

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-lg font-semibold">
            {item.title}{" "}
            <span className="muted font-mono text-xs">{item.key}</span>
          </h3>
          <p className="muted text-sm">
            {item.priceVc.toLocaleString("ru")} VC ·{" "}
            {item.kind === "PERMANENT" ? "навсегда" : `${item.charges} использований`} ·{" "}
            куплено {item.boughtTimes} раз{item.buyers > 0 && `, у ${item.buyers} игроков`} ·{" "}
            выручка {item.earnedVc.toLocaleString("ru")} VC
          </p>
        </div>
        <span className="text-sm" style={{ color: item.active ? "var(--gold)" : "var(--muted)" }}>
          {item.active ? "На витрине" : "Скрыт"}
        </span>
      </div>

      {open && (
        <div className="mt-4">
          <Editor value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} features={features} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => setOpen(!open)}>
          {open ? "Свернуть" : "Изменить"}
        </button>
        {open && (
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              send("PATCH", {
                title: draft.title,
                description: draft.description,
                category: draft.category,
                priceVc: draft.priceVc,
                kind: draft.kind,
                charges: draft.charges,
                requiredLevel: draft.requiredLevel,
                sort: draft.sort,
                feature: draft.feature,
                payload: payloadOf(draft),
              })
            }
          >
            Сохранить
          </button>
        )}
        <button className="btn-ghost" disabled={busy} onClick={() => send("PATCH", { active: !item.active })}>
          {item.active ? "Убрать с витрины" : "Вернуть на витрину"}
        </button>
        <button
          className="btn-ghost"
          style={{ color: "var(--danger)" }}
          disabled={busy}
          onClick={() => {
            if (!confirm) {
              setConfirm(true);
              setMessage("Нажмите ещё раз, чтобы удалить товар");
              return;
            }
            setConfirm(false);
            send("DELETE", {});
          }}
        >
          {confirm ? "Точно удалить?" : "Удалить"}
        </button>
        {message && (
          <span className="text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}

const BLANK: AdminShopItem = {
  key: "",
  title: "",
  description: "",
  category: "utility",
  priceVc: 500,
  kind: "CHARGES",
  charges: 5,
  feature: "tp",
  extra: "",
  requiredLevel: 0,
  sort: 100,
  active: true,
  buyers: 0,
  boughtTimes: 0,
  earnedVc: 0,
};

function CreateForm({ features }: { features: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Добавить товар
      </button>
    );
  }

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Новый товар</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Ключ" hint="Латиница и подчёркивание, менять потом нельзя">
          <input
            className="input mt-1 w-full"
            value={draft.key}
            placeholder="tp_pack"
            onChange={(event) => setDraft({ ...draft, key: event.target.value })}
          />
        </Field>
      </div>
      <div className="mt-4">
        <Editor value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} features={features} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage(null);
            const response = await fetch("/api/panel/shop", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...draft, payload: payloadOf(draft) }),
            });
            const data = await response.json();
            setBusy(false);
            setOk(response.ok);
            setMessage(response.ok ? "Товар добавлен" : (data.error ?? "Ошибка"));
            if (response.ok) {
              setDraft(BLANK);
              setOpen(false);
              router.refresh();
            }
          }}
        >
          Добавить
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          Отмена
        </button>
        {message && (
          <span className="text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}

export default function ShopAdmin({
  items,
  features,
}: {
  items: AdminShopItem[];
  features: string[];
}) {
  return (
    <div className="space-y-4">
      <CreateForm features={features} />
      {items.map((item) => (
        <Row key={item.key} item={item} features={features} />
      ))}
    </div>
  );
}
