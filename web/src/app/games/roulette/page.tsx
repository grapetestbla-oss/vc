import { redirect } from "next/navigation";
import RouletteGame from "@/components/RouletteGame";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function RoulettePage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/games/roulette");

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="eyebrow">
          Баланс: {user.balanceVc.toLocaleString("ru")} VC · возврат {Math.round(CONFIG.rtp * 100)}%
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Рулетка</h1>
        <p className="muted max-w-2xl text-sm">
          Стол общий: раунд идёт 30 секунд — 20 на ставки и 10 на розыгрыш. Пустых секторов нет:
          выпавший множитель умножает ставку каждого, но чаще он меньше единицы. Видно, кто и
          сколько поставил, а результат любого раунда пересчитывается по сиду.
        </p>
      </header>

      <RouletteGame />
    </div>
  );
}
