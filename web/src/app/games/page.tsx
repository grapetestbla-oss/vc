import Link from "next/link";
import { notFound } from "next/navigation";
import { CONFIG } from "@/lib/config";
import Reveal from "@/components/Reveal";
import { getGameFlags } from "@/lib/gameflags";
import { rouletteRtp } from "@/lib/live";
import { translator } from "@/lib/i18n.server";

export const dynamic = "force-dynamic";

const GAMES = [
  {
    href: "/games/roulette",
    key: "ROULETTE" as const,
    title: "Рулетка",
    text: "41 сектор от x2 до x10. Колесо крутится каждые 30 секунд, множитель один на всех.",
  },
  {
    href: "/games/crash",
    key: "CRASH" as const,
    title: "Краш",
    text: "Назовите точку вывода заранее — заберёте выигрыш, если ракета до неё дотянет.",
  },
];

export default async function GamesPage() {
  const t = await translator();
  const flags = await getGameFlags();
  const open = GAMES.filter((game) => flags[game.key]);
  // Обе выключены — раздела нет: пустая витрина только путала бы.
  if (open.length === 0) notFound();

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">{t("Внутренняя валюта, без вывода")}</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">{t("Мини-игры")}</h1>
        <p className="fade-up muted max-w-2xl">
          {t(
            "Раунд общий и идёт каждые 30 секунд. Ставка — от {min} VC и до всего баланса, потолка и перерывов нет. Средняя выплата колеса — x{wheel}, возврат в краше — {rtp}%. VanillaCoins не выводятся в деньги и не передаются между игроками.",
            {
              min: CONFIG.minBet,
              wheel: Math.round(rouletteRtp() * 100) / 100,
              rtp: Math.round(CONFIG.rtp * 100),
            },
          )}
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {open.map((game, index) => (
          <Reveal key={game.href} delay={index * 80}>
            <Link href={game.href} className="panel panel-hover group block h-full p-8">
              <h2 className="text-2xl font-semibold transition-colors group-hover:text-[var(--gold)]">
                {t(game.title)}
              </h2>
              <p className="muted mt-3 text-sm">{t(game.text)}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm" style={{ color: "var(--gold)" }}>
                {t("Играть")} <span className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
