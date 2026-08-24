import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import TopUpForm from "@/components/TopUpForm";
import Reveal from "@/components/Reveal";

export const dynamic = "force-dynamic";

const PACKS = [100, 250, 500, 1000];

const STATUS_LABEL: Record<string, string> = {
  pending: "На рассмотрении",
  paid: "Начислено",
  rejected: "Отклонено",
};

export default async function TopUpPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/topup");

  const payments = await db.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const hasPending = payments.some((payment) => payment.status === "pending");

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Баланс: {user.balanceVc.toLocaleString("ru")} VC</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Пополнение</h1>
        <p className="fade-up muted max-w-2xl">
          Курс: <b>1 ₽ = {CONFIG.vcPerRub} VC</b>. Автоматической оплаты пока нет — вы оставляете
          заявку, переводите деньги и указываете контакт, а чиф-администратор сверяет перевод и
          начисляет VC вручную.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PACKS.map((rub, index) => (
          <Reveal key={rub} delay={index * 70}>
            <div className="panel panel-hover h-full p-6 text-center">
              <div className="text-2xl font-semibold" style={{ color: "var(--gold)" }}>
                {(rub * CONFIG.vcPerRub).toLocaleString("ru")} VC
              </div>
              <div className="muted mt-1 text-sm">{rub} ₽</div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <TopUpForm
          vcPerRub={CONFIG.vcPerRub}
          minRub={CONFIG.minTopUpRub}
          maxRub={CONFIG.maxTopUpRub}
          hasPending={hasPending}
        />
      </Reveal>

      {payments.length > 0 && (
        <Reveal>
          <section className="panel p-6">
            <h2 className="text-lg font-semibold">Мои заявки</h2>
            <div className="mt-4 space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b pb-3 text-sm last:border-0 last:pb-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="tabular-nums">
                    {payment.amountRub} ₽ → {payment.vcAmount.toLocaleString("ru")} VC
                  </span>
                  <span className="muted">{payment.method ?? "—"}</span>
                  <span
                    style={{
                      color:
                        payment.status === "paid"
                          ? "var(--gold)"
                          : payment.status === "rejected"
                            ? "var(--danger)"
                            : undefined,
                    }}
                  >
                    {STATUS_LABEL[payment.status] ?? payment.status}
                  </span>
                  {payment.reviewNote && <span className="muted">{payment.reviewNote}</span>}
                  <span className="muted ml-auto text-xs">
                    {payment.createdAt.toLocaleString("ru")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      <Reveal>
        <p className="muted text-sm">
          VanillaCoins нельзя вывести обратно в деньги или передать другому игроку. Потратить их
          можно в <Link href="/shop" className="underline hover:text-white">магазине</Link> и на{" "}
          <Link href="/cases" className="underline hover:text-white">кейсы</Link>.
        </p>
      </Reveal>
    </div>
  );
}
