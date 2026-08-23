import { db } from "@/lib/db";
import CaseOpener from "@/components/CaseOpener";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const [cases, user] = await Promise.all([
    db.caseType.findMany({ where: { active: true }, include: { items: true } }),
    currentUser(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Кейсы</h1>
        <p className="muted mt-1 text-sm">
          Шансы каждого предмета указаны честно и совпадают с тем, что считает сервер.
          Внутри только косметика и VC — игрового преимущества в кейсах нет.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cases.map((caseType) => {
          const total = caseType.items.reduce((sum, item) => sum + item.weight, 0);
          return (
            <section key={caseType.key} className="panel space-y-3 p-5">
              <h2 className="font-semibold">{caseType.name}</h2>
              <ul className="muted space-y-1 text-sm">
                {caseType.items
                  .slice()
                  .sort((a, b) => b.weight - a.weight)
                  .map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>{item.name}</span>
                      <span>{((item.weight / total) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
              </ul>
              {user ? (
                <CaseOpener caseKey={caseType.key} price={caseType.priceVc} />
              ) : (
                <p className="muted text-sm">Войдите, чтобы открывать кейсы</p>
              )}
            </section>
          );
        })}
        {cases.length === 0 && <p className="muted">Кейсы ещё не настроены.</p>}
      </div>
    </div>
  );
}
