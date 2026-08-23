import Link from "next/link";
import { db } from "@/lib/db";
import CaseOpener from "@/components/CaseOpener";
import { currentUser } from "@/lib/session";
import Reveal from "@/components/Reveal";
import { rarityColor, rarityLabel, KIND_LABEL } from "@/lib/rarity";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const user = await currentUser();
  const cases = await db.caseType.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { items: { include: { cosmetic: true } } },
  });

  const [pityCounters, freeOpenings] = user
    ? await Promise.all([
        db.pityCounter.findMany({ where: { userId: user.id } }),
        db.caseOpening.findMany({
          where: {
            userId: user.id,
            createdAt: { gt: new Date(Date.now() - 86_400_000) },
            case: { freeDaily: true },
          },
          select: { caseKey: true },
        }),
      ])
    : [[], []];

  const usedFree = new Set(freeOpenings.map((opening) => opening.caseKey));

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Первый сезон</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Кейсы</h1>
        <p className="fade-up muted max-w-2xl">
          Внутри — только то, что видно другим игрокам: шлейфы, ауры, питомцы, шляпы,
          эффекты входа и метки в мире. Ничего, что даёт преимущество в игре.
          Шансы указаны честно, дубли превращаются в осколки, а гарант не даёт
          застрять в невезении.
        </p>
        {user && (
          <p className="fade-up text-sm">
            <span style={{ color: "var(--gold)" }}>{user.balanceVc.toLocaleString("ru")} VC</span>
            <span className="muted"> · </span>
            <span style={{ color: "var(--mint)" }}>{user.shards.toLocaleString("ru")} осколков</span>
            <span className="muted"> · </span>
            <Link href="/collection" className="muted underline hover:text-white">
              моя коллекция
            </Link>
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {cases.map((caseType, index) => {
          const total = caseType.items.reduce((sum, item) => sum + item.weight, 0);
          const pity = pityCounters.find((counter) => counter.caseKey === caseType.key);
          const slots = caseType.items.map((item) => ({
            id: item.id,
            label: item.cosmetic?.name ?? `${item.amount} ${item.kind === "VC" ? "VC" : "оск."}`,
            rarity: item.cosmetic?.rarity ?? "common",
            kind: item.cosmetic?.kind ?? null,
          }));

          const sorted = caseType.items.slice().sort((a, b) => {
            const order = { legendary: 0, epic: 1, rare: 2, common: 3 } as Record<string, number>;
            const left = order[a.cosmetic?.rarity ?? "common"] ?? 3;
            const right = order[b.cosmetic?.rarity ?? "common"] ?? 3;
            return left - right || b.weight - a.weight;
          });

          return (
            <Reveal key={caseType.key} delay={index * 70}>
              <section className="panel panel-hover flex h-full flex-col p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-2xl font-semibold">{caseType.name}</h2>
                  <span className="text-sm tabular-nums" style={{ color: "var(--gold)" }}>
                    {caseType.freeDaily ? "бесплатно, раз в сутки" : `${caseType.priceVc} VC`}
                  </span>
                </div>
                <p className="muted mt-2 text-sm">{caseType.description}</p>

                <ul className="mt-5 flex-1 space-y-1.5 text-sm">
                  {sorted.map((item) => {
                    const chance = (item.weight / total) * 100;
                    const color = rarityColor(item.cosmetic?.rarity ?? "common");
                    return (
                      <li key={item.id} className="flex items-center gap-3">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                        />
                        <span style={{ color }}>
                          {item.cosmetic?.name ??
                            `${item.amount} ${item.kind === "VC" ? "VC" : "осколков"}`}
                        </span>
                        {item.cosmetic && (
                          <span className="muted text-xs">
                            {KIND_LABEL[item.cosmetic.kind]}
                            {item.cosmetic.serialLimit && ` · всего ${item.cosmetic.serialLimit} шт.`}
                          </span>
                        )}
                        <span className="muted ml-auto tabular-nums text-xs">
                          {chance < 1 ? chance.toFixed(2) : chance.toFixed(1)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-6">
                  {user ? (
                    <CaseOpener
                      caseKey={caseType.key}
                      price={caseType.priceVc}
                      free={caseType.freeDaily}
                      freeUsed={usedFree.has(caseType.key)}
                      slots={slots}
                      pity={
                        caseType.pityThreshold
                          ? { current: pity?.count ?? 0, threshold: caseType.pityThreshold }
                          : null
                      }
                    />
                  ) : (
                    <Link href="/login?next=/cases" className="btn-ghost">
                      Войти, чтобы открывать
                    </Link>
                  )}
                </div>
              </section>
            </Reveal>
          );
        })}
      </div>

      <Reveal>
        <section className="panel p-6">
          <h2 className="text-xl font-semibold">Как это работает</h2>
          <ul className="muted mt-4 grid gap-3 text-sm md:grid-cols-2">
            <li>
              <span style={{ color: "var(--gold)" }}>Гарант.</span> Счётчик открытий
              без легендарки виден прямо на кейсе. Дошёл до предела — легендарка выпадает
              принудительно, счётчик обнуляется.
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>Дубли.</span> Уже имеющийся предмет
              превращается в осколки: 30 за обычный, 90 за редкий, 300 за эпический,
              900 за легендарный.
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>Осколки.</span> За них покупается
              конкретный предмет из каталога — без всякой случайности.
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>Коллекции.</span> Собрали весь набор —
              получаете предмет, которого нет ни в одном кейсе.
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>Экземпляры.</span> У части предметов
              ограниченный тираж: вам достанется номер, и он останется за вами.
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>Честность.</span> Каждое открытие
              подписано хэшем сида — результат нельзя подкрутить задним числом.
            </li>
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
