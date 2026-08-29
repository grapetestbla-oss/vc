import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import TotpSetup from "@/components/TotpSetup";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const admin = await requirePanel(3, "security.view");
  if (!admin) return null;

  const [attempts, staffWithout2fa] = await Promise.all([
    db.loginAttempt.findMany({
      where: { userId: admin.id, source: "panel" },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    admin.adminLevel >= 5
      ? db.user.findMany({
          where: { adminLevel: { gte: 3 }, totpEnabledAt: null },
          select: { id: true, login: true, adminLevel: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <section className="panel space-y-3 p-6">
        <h1 className="text-xl font-semibold">Двухфакторная защита панели</h1>
        <p className="muted text-sm">
          Панель выдаёт баны и правит балансы, поэтому одного пароля от сайта мало.
          Подключите приложение-аутентификатор — код будет спрашиваться при каждом
          входе в панель.
        </p>
        <TotpSetup enabled={Boolean(admin.totpEnabledAt)} />
      </section>

      <section className="panel p-6">
        <h2 className="font-semibold">Входы в панель</h2>
        <ul className="muted mt-3 space-y-1 text-sm">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              {attempt.success ? "✓" : "✗"} {attempt.ip} · {attempt.reason ?? "ok"} ·{" "}
              {attempt.createdAt.toLocaleString("ru")}
            </li>
          ))}
          {attempts.length === 0 && <li>Пока пусто</li>}
        </ul>
      </section>

      {admin.adminLevel >= 5 && (
        <section className="panel p-6">
          <h2 className="font-semibold">Администрация без 2FA</h2>
          {staffWithout2fa.length === 0 ? (
            <p className="muted mt-2 text-sm">Все подключили приложение.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm text-yellow-400">
              {staffWithout2fa.map((member) => (
                <li key={member.id}>
                  {member.login} — уровень {member.adminLevel}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
