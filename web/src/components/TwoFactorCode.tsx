"use client";

import { useState } from "react";
import { useT } from "./LangProvider";

export default function TwoFactorCode() {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    setError(null);
    const response = await fetch("/api/me/twofa", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? t("Ошибка"));
      return;
    }
    setCode(data.code);
  }

  return (
    <div className="space-y-2">
      <button className="btn-ghost text-sm" onClick={request}>
        {t("Получить код 2FA")}
      </button>
      {code && (
        <p>
          <span className="font-mono text-2xl tracking-widest">{code}</span>
          <span className="muted ml-3 text-sm">{t("введите в игре:")} /2fa {code}</span>
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
