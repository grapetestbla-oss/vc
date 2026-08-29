"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PermissionInfo = { key: string; title: string; group: string; defaultLevel: number };

export type RankRow = {
  level: number;
  key: string;
  title: string;
  prefix: string | null;
  color: string | null;
  permissions: string[];
  builtin: boolean;
  holders: number;
};

function groups(permissions: PermissionInfo[]): [string, PermissionInfo[]][] {
  const map = new Map<string, PermissionInfo[]>();
  for (const permission of permissions) {
    const list = map.get(permission.group) ?? [];
    list.push(permission);
    map.set(permission.group, list);
  }
  return [...map.entries()];
}

/** Галочки прав — общие для правки существующего ранга и для нового. */
function PermissionGrid({
  permissions,
  checked,
  onToggle,
}: {
  permissions: PermissionInfo[];
  checked: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups(permissions).map(([group, items]) => (
        <div key={group}>
          <p className="eyebrow">{group}</p>
          <div className="mt-2 space-y-1.5">
            {items.map((permission) => (
              <label key={permission.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked.includes(permission.key)}
                  onChange={() => onToggle(permission.key)}
                />
                <span>
                  {permission.title}
                  <span className="muted block font-mono text-xs">{permission.key}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RankCard({
  rank,
  permissions,
  ownLevel,
}: {
  rank: RankRow;
  permissions: PermissionInfo[];
  ownLevel: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(rank.title);
  const [prefix, setPrefix] = useState(rank.prefix ?? "");
  const [color, setColor] = useState(rank.color ?? "");
  const [checked, setChecked] = useState<string[]>(rank.permissions);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function send(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/ranks", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: rank.level, ...body }),
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
            <span style={{ color: rank.color ?? "var(--gold)" }}>{rank.title}</span>{" "}
            <span className="muted text-sm">уровень {rank.level}</span>
          </h3>
          <p className="muted text-sm">
            {rank.prefix ? `метка [${rank.prefix}]` : "без метки"} · прав:{" "}
            {rank.permissions.length} из {permissions.length} · аккаунтов: {rank.holders}
            {rank.builtin && " · встроенный"}
          </p>
        </div>
        {rank.level === ownLevel && <span className="muted text-sm">ваш ранг</span>}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="eyebrow">Название</span>
              <input
                className="input mt-1 w-full"
                value={title}
                maxLength={40}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="eyebrow">Метка в чате</span>
              <input
                className="input mt-1 w-full"
                value={prefix}
                maxLength={24}
                placeholder="ADMIN"
                onChange={(event) => setPrefix(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="eyebrow">Цвет метки</span>
              <input
                className="input mt-1 w-full font-mono"
                value={color}
                placeholder="#f5c451"
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
          </div>

          <PermissionGrid
            permissions={permissions}
            checked={checked}
            onToggle={(key) =>
              setChecked((current) =>
                current.includes(key)
                  ? current.filter((item) => item !== key)
                  : [...current, key],
              )
            }
          />
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
              send("PATCH", { title, prefix, color, permissions: checked })
            }
          >
            Сохранить
          </button>
        )}
        {!rank.builtin && (
          <button
            className="btn-ghost"
            style={{ color: "var(--danger)" }}
            disabled={busy}
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                setMessage("Нажмите ещё раз, чтобы удалить ранг");
                return;
              }
              setConfirm(false);
              send("DELETE", {});
            }}
          >
            {confirm ? "Точно удалить?" : "Удалить"}
          </button>
        )}
        {message && (
          <span className="text-sm" style={{ color: ok ? "var(--gold)" : "var(--danger)" }}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}

function CreateRank({ permissions, taken }: { permissions: PermissionInfo[]; taken: number[] }) {
  const router = useRouter();
  const free = Array.from({ length: 20 }, (_, index) => index + 1).filter(
    (level) => !taken.includes(level),
  );
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(free[0] ?? 6);
  const [title, setTitle] = useState("");
  const [prefix, setPrefix] = useState("");
  const [color, setColor] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (free.length === 0) {
    return <p className="muted text-sm">Свободных уровней не осталось.</p>;
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Добавить ранг
      </button>
    );
  }

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Новый ранг</h2>
      <p className="muted mt-1 text-sm">
        Уровень задаёт старшинство: наказать и снять наказание можно только тому, кто ниже.
        Плагин тоже смотрит на число — новый уровень получит права по галочкам ниже.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <label className="block">
          <span className="eyebrow">Уровень</span>
          <select
            className="input mt-1 w-full"
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
          >
            {free.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">Название</span>
          <input
            className="input mt-1 w-full"
            value={title}
            maxLength={40}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="eyebrow">Метка в чате</span>
          <input
            className="input mt-1 w-full"
            value={prefix}
            maxLength={24}
            placeholder="MODER"
            onChange={(event) => setPrefix(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="eyebrow">Цвет метки</span>
          <input
            className="input mt-1 w-full font-mono"
            value={color}
            placeholder="#5ea9ff"
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4">
        <PermissionGrid
          permissions={permissions}
          checked={checked}
          onToggle={(key) =>
            setChecked((current) =>
              current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
            )
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage(null);
            const response = await fetch("/api/panel/ranks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ level, title, prefix, color, permissions: checked }),
            });
            const data = await response.json();
            setBusy(false);
            setOk(response.ok);
            setMessage(response.ok ? "Ранг создан" : (data.error ?? "Ошибка"));
            if (response.ok) {
              setOpen(false);
              setTitle("");
              setChecked([]);
              router.refresh();
            }
          }}
        >
          Создать
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

export default function RankAdmin({
  ranks,
  permissions,
  ownLevel,
}: {
  ranks: RankRow[];
  permissions: PermissionInfo[];
  ownLevel: number;
}) {
  return (
    <div className="space-y-4">
      <CreateRank permissions={permissions} taken={ranks.map((rank) => rank.level)} />
      {ranks.map((rank) => (
        <RankCard key={rank.level} rank={rank} permissions={permissions} ownLevel={ownLevel} />
      ))}
    </div>
  );
}
