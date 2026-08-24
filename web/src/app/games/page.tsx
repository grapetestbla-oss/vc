import Link from "next/link";
import { CONFIG } from "@/lib/config";
import Reveal from "@/components/Reveal";

const GAMES = [
  {
    href: "/games/roulette",
    title: "Рулетка",
    text: "Ставка на множитель 2x, 3x, 5x или 10x. Чем выше множитель, тем реже он заходит.",
  },
  {
    href: "/games/crash",
    title: "Краш",
    text: "Назовите точку вывода заранее — заберёте выигрыш, если раунд до неё дотянет.",
  },
];

export default function GamesPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Внутренняя валюта, без вывода</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Мини-игры</h1>
        <p className="fade-up muted max-w-2xl">
          Возврат игроку {Math.round(CONFIG.rtp * 100)}%. Ставка — от {CONFIG.minBet} VC и до всего
          баланса, потолка и перерывов нет. VanillaCoins не выводятся в деньги и не передаются
          между игроками.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {GAMES.map((game, index) => (
          <Reveal key={game.href} delay={index * 80}>
            <Link href={game.href} className="panel panel-hover group block h-full p-8">
              <h2 className="text-2xl font-semibold transition-colors group-hover:text-[var(--gold)]">
                {game.title}
              </h2>
              <p className="muted mt-3 text-sm">{game.text}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm" style={{ color: "var(--gold)" }}>
                Играть <span className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
