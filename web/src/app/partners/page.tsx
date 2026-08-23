import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import Reveal from "@/components/Reveal";
import PartnerForm from "@/components/PartnerForm";
import { PARTNER_PLATFORMS, PLATFORM_LABEL, STATUS_LABEL } from "@/lib/partners";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata = { title: "Медиа-партнёрам — VanillaCraft" };

export default async function PartnersPage() {
  const user = await currentUser();
  const [application, promo] = user
    ? await Promise.all([
        db.partnerApplication.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        }),
        db.promo.findFirst({
          where: { partnerId: user.id },
          include: { _count: { select: { activations: true } } },
        }),
      ])
    : [null, null];

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Сотрудничество</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">
          Медиа-партнёрам
        </h1>
        <p className="fade-up muted max-w-2xl">
          Партнёр получает личный промокод, статус media на сервере и статистику по
          своим игрокам в кабинете. Игрок, который ввёл ваш код при регистрации,
          закрепляется за вами навсегда и получает {CONFIG.promoReward} VC, когда
          дорастает до {CONFIG.promoRequiredLevel} уровня аккаунта.
        </p>
      </header>

      <Reveal>
        <section className="panel p-8">
          <h2 className="text-xl font-semibold">Минимальные критерии</h2>
          <ul className="mt-5 space-y-3">
            {PARTNER_PLATFORMS.map((platform) => (
              <li
                key={platform.key}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-3 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="min-w-44 font-medium">{platform.label}</span>
                <span className="muted">{platform.requirement}</span>
              </li>
            ))}
          </ul>
          <p className="muted mt-5 text-sm">
            Мы смотрим на живую аудиторию, а не на цифру подписчиков. Накрутки видно
            сразу, и это отказ без второй попытки.
          </p>
        </section>
      </Reveal>

      <Reveal delay={80}>
        <section className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Что получает партнёр",
              text: "Личный промокод, статус media в игре, красный ESP на себе, локальные погода и время, статистика активаций в кабинете.",
            },
            {
              title: "Что получает игрок",
              text: `${CONFIG.promoReward} VC на кейсы и косметику при достижении ${CONFIG.promoRequiredLevel} уровня. Код вводится один раз при регистрации.`,
            },
            {
              title: "Чего не будет",
              text: "Игрового преимущества за код нет и не появится: VC тратятся только на косметику. Ванилла остаётся ваниллой.",
            },
          ].map((card) => (
            <div key={card.title} className="panel panel-hover h-full p-6">
              <h3 className="font-semibold">{card.title}</h3>
              <p className="muted mt-3 text-sm leading-6">{card.text}</p>
            </div>
          ))}
        </section>
      </Reveal>

      <Reveal delay={120}>
        {!user ? (
          <div className="panel p-8 text-center">
            <p className="muted">Чтобы подать заявку, войдите в аккаунт.</p>
            <div className="mt-4 flex justify-center gap-3">
              <Link href="/login?next=/partners" className="btn">Войти</Link>
              <Link href="/register" className="btn-ghost">Регистрация</Link>
            </div>
          </div>
        ) : promo ? (
          <div className="panel p-8">
            <p className="eyebrow">Вы уже партнёр</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{promo.code}</h2>
            <p className="muted mt-2 text-sm">
              Активаций: {promo._count.activations} · награда игроку {promo.rewardVc} VC ·
              нужен уровень {promo.requiredLevel}
            </p>
            <Link href="/cabinet" className="btn-ghost mt-4 text-sm">
              Статистика в кабинете
            </Link>
          </div>
        ) : application && application.status === "PENDING" ? (
          <div className="panel p-8">
            <h2 className="text-xl font-semibold">Заявка на рассмотрении</h2>
            <p className="muted mt-2 text-sm">
              {PLATFORM_LABEL[application.platform]} · подана{" "}
              {application.createdAt.toLocaleDateString("ru")}. Ответ придёт в кабинет.
            </p>
          </div>
        ) : (
          <>
            {application && (
              <div className="panel mb-6 p-6">
                <p className="text-sm">
                  Предыдущая заявка: {STATUS_LABEL[application.status]}
                  {application.reviewNote && (
                    <span className="muted"> — {application.reviewNote}</span>
                  )}
                </p>
              </div>
            )}
            <PartnerForm login={user.login} />
          </>
        )}
      </Reveal>
    </div>
  );
}
