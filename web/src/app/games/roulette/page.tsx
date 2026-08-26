import { notFound, redirect } from "next/navigation";
import RouletteGame from "@/components/RouletteGame";
import { currentUser } from "@/lib/session";
import { gameEnabled } from "@/lib/gameflags";
import { rouletteRtp } from "@/lib/live";

export const dynamic = "force-dynamic";

export default async function RoulettePage() {
  // Выключенную игру не показываем вовсе: страница отвечает как несуществующая.
  if (!(await gameEnabled("ROULETTE"))) notFound();

  const user = await currentUser();
  if (!user) redirect("/login?next=/games/roulette");

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="eyebrow">
          Баланс: {user.balanceVc.toLocaleString("ru")} VC · средняя выплата x
          {Math.round(rouletteRtp() * 100) / 100}
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Рулетка</h1>
        <p className="muted max-w-2xl text-sm">
          Стол общий: раунд идёт 30 секунд — 20 на ставки и 10 на розыгрыш. На колесе 41 сектор,
          минимальный множитель — x2, пустых нет: выпавший сектор умножает ставку каждого. Видно,
          кто и сколько поставил, а результат любого раунда пересчитывается по сиду.
        </p>
      </header>

      <RouletteGame />
    </div>
  );
}
