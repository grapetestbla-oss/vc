import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import TopUpForm from "@/components/TopUpForm";
import { activeProviders, getPaymentConfig } from "@/lib/payments";
import Reveal from "@/components/Reveal";
import { translator } from "@/lib/i18n.server";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "На рассмотрении",
  paid: "Начислено",
  rejected: "Отклонено",
};

export default async function TopUpPage() {
  const t = await translator();
  const user = await currentUser();
  if (!user) redirect("/login?next=/topup");

  const payments = await db.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const hasPending = payments.some(
    (payment) => payment.status === "pending" && payment.provider === "manual",
  );
  const providers = activeProviders(await getPaymentConfig());
  const auto = providers.some((provider) => provider.key !== "manual");
  const bestBonus = providers.reduce((max, provider) => Math.max(max, provider.bonusPercent), 0);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow fade-up">
          {t("Баланс: {n} VC", { n: user.balanceVc.toLocaleString("ru") })}
        </p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">{t("Пополнение")}</h1>
        <p className="fade-up muted max-w-2xl">
          {t("Курс:")} <b>{t("1 ₽ = {n} VC", { n: CONFIG.vcPerRub })}</b>.{" "}
          {auto
            ? t("Оплата картой, СБП, кошельками и криптой — VC придут на баланс сразу после оплаты.")
            : t("Автоматической оплаты пока нет — вы оставляете заявку, переводите деньги и указываете контакт, а чиф-администратор сверяет перевод и начисляет VC вручную.")}
          {bestBonus > 0 && (
            <>
              {" "}
              <b style={{ color: "var(--gold)" }}>
                {t("Бонус до +{n}% VC", { n: bestBonus })}
              </b>{" "}
              {t("за выбор кассы.")}
            </>
          )}
        </p>
      </header>

      <Reveal>
        <TopUpForm
          vcPerRub={CONFIG.vcPerRub}
          minRub={CONFIG.minTopUpRub}
          maxRub={CONFIG.maxTopUpRub}
          hasPending={hasPending}
          providers={providers}
        />
      </Reveal>

      {payments.length > 0 && (
        <Reveal>
          <section className="panel p-5 sm:p-6">
            <h2 className="text-lg font-semibold">{t("Мои заявки")}</h2>
            <div className="mt-4 space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="border-b pb-3 text-sm last:border-0 last:pb-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="tabular-nums">
                      {payment.amountRub} ₽ → {payment.vcAmount.toLocaleString("ru")} VC
                      {payment.bonusVc > 0 && (
                        <span style={{ color: "var(--gold)" }}>
                          {" "}
                          {t("(+{n} бонусом)", { n: payment.bonusVc.toLocaleString("ru") })}
                        </span>
                      )}
                    </span>
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
                      {t(STATUS_LABEL[payment.status] ?? payment.status)}
                    </span>
                  </div>
                  <div className="muted mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                    <span>{payment.method ?? "—"}</span>
                    <span>{payment.createdAt.toLocaleString("ru")}</span>
                    {payment.reviewNote && <span className="w-full">{payment.reviewNote}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      <Reveal>
        <p className="muted text-sm">
          {t("VanillaCoins нельзя вывести обратно в деньги или передать другому игроку. Потратить их можно в")}{" "}
          <Link href="/shop" className="underline hover:text-white">
            {t("магазине")}
          </Link>{" "}
          {t("и на")}{" "}
          <Link href="/cases" className="underline hover:text-white">
            {t("кейсы")}
          </Link>
          .
        </p>
      </Reveal>
    </div>
  );
}
