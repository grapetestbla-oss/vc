import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import Reveal from "@/components/Reveal";

export const dynamic = "force-dynamic";

const PACKS = [100, 500, 1000, 5000];

export default async function TopUpPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/topup");

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Баланс: {user.balanceVc.toLocaleString("ru")} VC</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Пополнение</h1>
        <p className="fade-up muted max-w-2xl">
          Курс: {CONFIG.rubPer100Vc} ₽ за 100 VC. Платёжный провайдер ещё не подключён —
          заявка создаётся и подтверждается администрацией вручную.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PACKS.map((amount, index) => (
          <Reveal key={amount} delay={index * 70}>
            <div className="panel panel-hover h-full p-6 text-center">
              <div className="text-2xl font-semibold" style={{ color: "var(--gold)" }}>
                {amount.toLocaleString("ru")} VC
              </div>
              <div className="muted mt-1 text-sm">
                {Math.ceil((amount / 100) * CONFIG.rubPer100Vc)} ₽
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="muted text-sm">
          VanillaCoins нельзя вывести обратно в деньги или передать другому игроку.
        </p>
      </Reveal>
    </div>
  );
}
