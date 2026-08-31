import { notFound, redirect } from "next/navigation";
import RouletteGame from "@/components/RouletteGame";
import { currentUser } from "@/lib/session";
import { gameEnabled } from "@/lib/gameflags";
import { rouletteOdds } from "@/lib/live";

export const dynamic = "force-dynamic";

export default async function RoulettePage() {
  // Выключенную игру не показываем вовсе: страница отвечает как несуществующая.
  if (!(await gameEnabled("ROULETTE"))) notFound();

  const user = await currentUser();
  if (!user) redirect("/login?next=/games/roulette");

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="eyebrow">Баланс: {user.balanceVc.toLocaleString("ru")} VC</p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Рулетка</h1>
        <p className="muted max-w-2xl text-sm">
          Стол общий: раунд идёт 30 секунд — 20 на ставки и 10 на розыгрыш. На колесе 41 сектор
          четырёх видов. Выберите множитель и поставьте: выпал ваш — ставка умножается на него,
          выпал чужой — ставка сгорает. Видно, кто и сколько поставил, а результат любого раунда
          пересчитывается по сиду.
        </p>
        <ul className="muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {rouletteOdds().map((odds) => (
            <li key={odds.multiplier}>
              x{odds.multiplier} — {odds.sectors} сект., шанс {(odds.chance * 100).toFixed(1)}%
            </li>
          ))}
        </ul>
      </header>

      <RouletteGame
        sectors={rouletteOdds().map((odds) => ({
          multiplier: odds.multiplier,
          chance: Math.round(odds.chance * 1000) / 10,
        }))}
      />
    </div>
  );
}
