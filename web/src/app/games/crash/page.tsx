import { redirect } from "next/navigation";
import CrashGame from "@/components/CrashGame";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function CrashPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/games/crash");

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="eyebrow">
          Баланс: {user.balanceVc.toLocaleString("ru")} VC · возврат {Math.round(CONFIG.rtp * 100)}%
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Краш</h1>
        <p className="muted max-w-2xl text-sm">
          Ракета взлетает каждые 30 секунд. Точка вывода выбирается до старта: если ракета
          доберётся до неё — ставка умножается, если взорвётся раньше — сгорает.
        </p>
      </header>

      <CrashGame />
    </div>
  );
}
