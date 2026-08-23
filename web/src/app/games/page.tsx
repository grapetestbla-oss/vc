import Link from "next/link";
import { CONFIG } from "@/lib/config";

export default function GamesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Мини-игры</h1>
        <p className="muted mt-1 text-sm">
          Возврат игроку {Math.round(CONFIG.rtp * 100)}%. Ставки от {CONFIG.minBet} до{" "}
          {CONFIG.maxBet} VC, дневной лимит проигрыша {CONFIG.dailyLossLimit} VC.
          VC не выводятся в деньги.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/games/roulette" className="panel block p-6">
          <h2 className="font-semibold">Рулетка</h2>
          <p className="muted mt-2 text-sm">Ставка на множитель 2x, 3x, 5x или 10x.</p>
        </Link>
        <Link href="/games/crash" className="panel block p-6">
          <h2 className="font-semibold">Краш</h2>
          <p className="muted mt-2 text-sm">Назовите точку вывода — заберёте, если раунд до неё дотянет.</p>
        </Link>
      </div>
    </div>
  );
}
