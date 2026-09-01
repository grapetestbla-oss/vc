"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Досверка оплаты на странице пополнения.
 *
 * Игрок вернулся с кассы — спрашиваем её статус сами, вместо того чтобы ждать
 * уведомления. Без этого оплаченный счёт висел «на рассмотрении», пока у кассы
 * не истечёт срок.
 */
export default function PaymentCheck({ hasPending }: { hasPending: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const check = useCallback(
    async (quiet: boolean) => {
      setBusy(true);
      if (!quiet) setMessage(null);
      const response = await fetch("/api/payments/check", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      setBusy(false);

      if (!response.ok) {
        if (!quiet) setMessage(data.error ?? "Не получилось проверить");
        return;
      }
      if (data.credited > 0) {
        setMessage("Оплата подтверждена, VC начислены.");
        router.refresh();
        return;
      }
      if (!quiet) setMessage("Касса ещё не подтвердила оплату. Попробуйте через минуту.");
    },
    [router],
  );

  // Возврат с кассы: проверяем сразу и молча, чтобы человек увидел баланс, а
  // не инструкцию нажать кнопку.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") !== "1") return;
    check(true);
    const timer = setTimeout(() => check(true), 5000);
    return () => clearTimeout(timer);
  }, [check]);

  if (!hasPending) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-ghost" onClick={() => check(false)} disabled={busy}>
        {busy ? "Проверяем…" : "Проверить оплату"}
      </button>
      {message && <span className="muted text-sm">{message}</span>}
    </div>
  );
}
