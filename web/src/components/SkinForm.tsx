"use client";

import { useEffect, useRef, useState } from "react";

type Skin = { kind: string; nick: string | null; variant: string; updatedAt: string } | null;

/**
 * Скин из кабинета. Своя картинка или скин чужого ника — сервер надевает его
 * сам, перезаходить не нужно.
 */
export default function SkinForm({ login }: { login: string }) {
  const [skin, setSkin] = useState<Skin>(null);
  const [mode, setMode] = useState<"file" | "nick">("file");
  const [variant, setVariant] = useState("classic");
  const [nick, setNick] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/skin")
      .then((response) => response.json())
      .then((data) => {
        if (!data.skin) return;
        setSkin(data.skin);
        setVariant(data.skin.variant);
        if (data.skin.kind === "NICK") {
          setMode("nick");
          setNick(data.skin.nick ?? "");
        } else {
          setPreview(`/api/skins/${encodeURIComponent(login)}.png?v=${Date.parse(data.skin.updatedAt)}`);
        }
      })
      .catch(() => {});
  }, [login]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const body = new FormData();
    body.set("variant", variant);
    if (mode === "nick") {
      body.set("nick", nick);
    } else {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("Выберите файл со скином");
        setBusy(false);
        return;
      }
      body.set("file", file);
    }

    const response = await fetch("/api/skin", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Не сохранилось");
    } else {
      setSkin({ kind: data.kind, nick: mode === "nick" ? nick : null, variant, updatedAt: data.updatedAt });
      if (mode === "file") setPreview(`/api/skins/${encodeURIComponent(login)}.png?v=${Date.now()}`);
      setMessage("Скин сохранён. На сервере он появится в течение минуты.");
    }
    setBusy(false);
  }

  async function clear() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/skin", { method: "DELETE" });
    if (response.ok) {
      setSkin(null);
      setPreview(null);
      setNick("");
      setMessage("Скин сброшен на стандартный.");
    } else {
      setError("Не получилось сбросить");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex flex-wrap items-start gap-5">
        {preview && (
          // Картинка мелкая и с резкими пикселями — растягиваем без сглаживания.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Ваш скин"
            width={128}
            height={128}
            className="rounded-md border"
            style={{ imageRendering: "pixelated", borderColor: "var(--border)", background: "var(--panel-strong)" }}
          />
        )}

        <div className="min-w-[240px] flex-1 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              className={mode === "file" ? "btn" : "btn-ghost"}
              onClick={() => setMode("file")}
            >
              Своя картинка
            </button>
            <button
              type="button"
              className={mode === "nick" ? "btn" : "btn-ghost"}
              onClick={() => setMode("nick")}
            >
              Скин по нику
            </button>
          </div>

          {mode === "file" ? (
            <div className="space-y-1">
              <input ref={fileRef} type="file" accept="image/png" className="input" />
              <p className="muted text-xs">PNG 64×64 или 64×32, до 100 КБ.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <input
                value={nick}
                onChange={(event) => setNick(event.target.value)}
                className="input"
                placeholder="Ник на Minecraft"
              />
              <p className="muted text-xs">Возьмём скин этого ника — хоть лицензионного, хоть чужого с сервера.</p>
            </div>
          )}

          {mode === "file" && (
          <label className="flex items-center gap-2 text-sm">
            <span className="muted">Модель</span>
            <select
              value={variant}
              onChange={(event) => setVariant(event.target.value)}
              className="input max-w-[180px]"
            >
              <option value="classic">Обычная (Стив)</option>
              <option value="slim">Тонкая (Алекс)</option>
            </select>
          </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy}>
              {busy ? "Сохраняем…" : "Применить"}
            </button>
            {skin && (
              <button type="button" className="btn-ghost" onClick={clear} disabled={busy}>
                Сбросить
              </button>
            )}
          </div>
        </div>
      </div>

      {message && <p className="text-sm" style={{ color: "var(--mint)" }}>{message}</p>}
      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
