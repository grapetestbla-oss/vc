"use client";

import { useT } from "./LangProvider";

/** Заглушка на время техработ. Видят все, кроме чиф-администратора. */
export default function MaintenanceScreen({ reason }: { reason: string }) {
  const t = useT();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="panel max-w-lg p-8 text-center">
        <p className="eyebrow">VanillaCraft</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Технические работы")}</h1>
        <p className="muted mt-4">{reason}</p>
        <p className="muted mt-6 text-sm">
          {t("Сайт и сервер вернутся, как только всё проверим. Баланс, предметы и прогресс на месте — ничего не потеряется.")}
        </p>
      </div>
    </div>
  );
}
