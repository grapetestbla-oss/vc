import { db } from "@/lib/db";
import CaseOpener from "@/components/CaseOpener";
import { currentUser } from "@/lib/session";
import Reveal from "@/components/Reveal";

export const dynamic = "force-dynamic";

const RARITY_COLOR: Record<string, string> = {
  common: "var(--muted)",
  rare: "#6aa9ff",
  epic: "#c77dff",
  legendary: "var(--gold)",
};

export default async function CasesPage() {
  const [cases, user] = await Promise.all([
    db.caseType.findMany({ where: { active: true }, include: { items: true } }),
    currentUser(),
  ]);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Только косметика и VC</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Кейсы</h1>
        <p className="fade-up muted max-w-2xl">
          Шансы указаны честно и совпадают с тем, что считает сервер. Каждое
          открытие подписано хэшем — свою выдачу можно пересчитать вручную.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {cases.map((caseType, index) => {
          const total = caseType.items.reduce((sum, item) => sum + item.weight, 0);
          return (
            <Reveal key={caseType.key} delay={index * 80}>
              <section className="panel panel-hover flex h-full flex-col p-6">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">{caseType.name}</h2>
                  <span className="text-sm tabular-nums" style={{ color: "var(--gold)" }}>
                    {caseType.priceVc} VC
                  </span>
                </div>

                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {caseType.items
                    .slice()
                    .sort((a, b) => b.weight - a.weight)
                    .map((item) => {
                      const chance = (item.weight / total) * 100;
                      return (
                        <li key={item.id}>
                          <div className="flex justify-between">
                            <span style={{ color: RARITY_COLOR[item.rarity] ?? "var(--text)" }}>
                              {item.name}
                            </span>
                            <span className="muted tabular-nums">{chance.toFixed(1)}%</span>
                          </div>
                          <div
                            className="mt-1 h-0.5 overflow-hidden rounded-full"
                            style={{ background: "rgba(255,255,255,0.06)" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${chance}%`,
                                background: RARITY_COLOR[item.rarity] ?? "var(--muted)",
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                </ul>

                <div className="mt-5">
                  {user ? (
                    <CaseOpener caseKey={caseType.key} price={caseType.priceVc} />
                  ) : (
                    <p className="muted text-sm">Войдите, чтобы открывать кейсы</p>
                  )}
                </div>
              </section>
            </Reveal>
          );
        })}
        {cases.length === 0 && <p className="muted">Кейсы ещё не настроены.</p>}
      </div>
    </div>
  );
}
