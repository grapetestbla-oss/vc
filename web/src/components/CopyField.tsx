"use client";

import { useState } from "react";
import { useT } from "./LangProvider";

/** Поле «только чтение» с кнопкой копирования — для ссылки партнёра. */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Без https и разрешения буфер недоступен — тогда просто выделяем текст.
      const input = document.getElementById(`copy-${label}`) as HTMLInputElement | null;
      input?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2 sm:flex sm:gap-2 sm:space-y-0">
      <input
        id={`copy-${label}`}
        className="input font-mono text-sm sm:flex-1"
        value={value}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      <button className="btn-ghost w-full justify-center sm:w-auto" onClick={copy}>
        {copied ? t("Скопировано") : t("Копировать")}
      </button>
    </div>
  );
}
