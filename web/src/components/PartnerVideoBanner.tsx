"use client";

import { useState } from "react";
import { useT } from "./LangProvider";

/**
 * Видеобаннер собирает сервер, поэтому кнопка только просит файл и следит за
 * ожиданием: первая сборка занимает несколько секунд, и без подсказки кажется,
 * что ничего не происходит.
 */
export default function PartnerVideoBanner({ code }: { code: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/partners/banner-video");
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? t("Не удалось собрать ролик"));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vanillacraft-${code.toLowerCase()}.mp4`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("Не удалось собрать ролик"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn" onClick={download} disabled={busy}>
        {busy ? t("Собираем ролик…") : t("Скачать видеобаннер")}
      </button>
      <p className="muted mt-2 text-xs">
        {t("8 секунд, 1920×586, без звука — под шапку канала и вставку в видео.")}
      </p>
      {error && (
        <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
