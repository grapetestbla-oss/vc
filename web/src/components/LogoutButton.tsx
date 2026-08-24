"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Выход из аккаунта: гасит сессию на сервере и возвращает на главную. */
export default function LogoutButton({ className = "btn-ghost text-sm" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      {busy ? "Выходим…" : "Выйти"}
    </button>
  );
}
