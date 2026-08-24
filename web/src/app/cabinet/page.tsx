import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { levelFromPlaytime, nextLevelAt } from "@/lib/levels";
import { ADMIN_LEVELS } from "@/lib/config";
import TwoFactorCode from "@/components/TwoFactorCode";
import { promoStatus } from "@/lib/promo";
import { partnerEarnings } from "@/lib/partnershare";
import { CONFIG } from "@/lib/config";
import { PLATFORM_LABEL, STATUS_LABEL } from "@/lib/partners";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";
import LogoutButton from "@/components/LogoutButton";
import PartnerBanner from "@/components/PartnerBanner";
import CopyField from "@/components/CopyField";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function CabinetPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/cabinet");

  const [transactions, punishments, promo, rounds, cosmetics, myPromo, application, earnings] =
    await Promise.all([
    db.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.punishment.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: "desc" },
      take: 8,
      include: { by: { select: { login: true } } },
    }),
    db.promo.findFirst({
      where: { partnerId: user.id },
      include: { activations: { select: { createdAt: true, user: { select: { login: true } } } } },
    }),
    db.gameRound.findMany({ where: { userId: user.id }, select: { betVc: true, payoutVc: true } }),
    db.userCosmetic.findMany({ where: { userId: user.id } }),
    promoStatus(user.id),
    db.partnerApplication.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    partnerEarnings(user.id),
  ]);

  // Ссылку партнёра собираем от реального адреса сайта, а не от константы:
  // домен может смениться, а ссылки в описаниях каналов останутся жить.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "vanillacraft.click";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const level = levelFromPlaytime(user.playtimeSec);
  const hours = Math.floor(user.playtimeSec / 3600);
  const levelStart = Math.pow(level, 2) * 3600;
  const levelEnd = nextLevelAt(level);
  const progress = Math.min(
    100,
    Math.round(((user.playtimeSec - levelStart) / (levelEnd - levelStart)) * 100),
  );
  const wagered = rounds.reduce((sum, round) => sum + round.betVc, 0);
  const net = rounds.reduce((sum, round) => sum + round.payoutVc - round.betVc, 0);

  return (
    <div className="space-y-6">
      <Reveal>
        <section className="panel relative overflow-hidden p-8">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 140% at 85% 0%, rgba(245,196,81,0.12), transparent 65%)",
            }}
          />
          <div className="relative flex flex-wrap items-end gap-8">
            <div>
              <p className="eyebrow">Личный кабинет</p>
              <h1 className="mt-1 text-4xl font-bold tracking-tight">{user.login}</h1>
              <p className="muted mt-2 text-sm">
                Уровень {level} · {hours} ч в игре
                {user.adminLevel > 0 && ` · ${ADMIN_LEVELS[user.adminLevel]?.title}`}
              </p>
            </div>

            <div className="ml-auto text-right">
              <div className="text-4xl font-semibold tabular-nums" style={{ color: "var(--gold)" }}>
                <CountUp value={user.balanceVc} /> VC
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-end gap-3">
                <Link href="/topup" className="muted text-sm underline hover:text-white">
                  пополнить
                </Link>
                <LogoutButton />
              </div>
            </div>
          </div>

          <div className="relative mt-8">
            <div className="flex justify-between text-xs">
              <span className="muted">Уровень {level}</span>
              <span className="muted">
                до {level + 1}: {Math.max(0, Math.ceil((levelEnd - user.playtimeSec) / 3600))} ч
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-1000"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, var(--gold), var(--mint))",
                }}
              />
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="panel space-y-3 p-6">
          <h2 className="font-semibold">Вход в игру</h2>
          <p className="muted text-sm">
            Заходите на сервер под ником {user.login} и введите /login с этим же паролем.
            С нового адреса сервер попросит код 2FA.
          </p>
          <TwoFactorCode />
        </section>
      </Reveal>

      {myPromo && (
        <Reveal delay={70}>
          <section className="panel p-6">
            <p className="eyebrow">Промокод аккаунта</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{myPromo.code}</h2>
            <p className="muted mt-2 text-sm">
              {myPromo.partner && `Партнёр: ${myPromo.partner}. `}
              {myPromo.rewarded
                ? `Награда ${myPromo.rewardVc} VC получена.`
                : `Награда ${myPromo.rewardVc} VC придёт на ${myPromo.requiredLevel} уровне — сейчас у вас ${myPromo.level}.`}
            </p>
            <p className="muted mt-1 text-xs">
              Код привязан к аккаунту навсегда, сменить его нельзя.
            </p>
          </section>
        </Reveal>
      )}

      {application && (
        <Reveal delay={80}>
          <section className="panel p-6">
            <p className="eyebrow">Заявка медиа-партнёра</p>
            <h2 className="mt-1 text-lg font-semibold">
              {PLATFORM_LABEL[application.platform] ?? application.platform} —{" "}
              <span
                style={{
                  color:
                    application.status === "APPROVED"
                      ? "var(--mint)"
                      : application.status === "REJECTED"
                        ? "var(--danger)"
                        : "var(--gold)",
                }}
              >
                {STATUS_LABEL[application.status]}
              </span>
            </h2>
            {application.reviewNote && (
              <p className="muted mt-2 text-sm">{application.reviewNote}</p>
            )}
          </section>
        </Reveal>
      )}

      {promo && (
        <Reveal delay={90}>
          <section className="panel p-6">
            <p className="eyebrow">Промокод партнёра</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{promo.code}</h2>
            <p className="muted mt-2 text-sm">
              Активаций: {promo.activations.length} · награда {promo.rewardVc} VC ·
              нужен уровень {promo.requiredLevel}
            </p>
            <div className="mt-4 flex flex-wrap gap-6">
              <div>
                <div className="eyebrow">Заработано с пополнений</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--gold)" }}>
                  {earnings.toLocaleString("ru")} VC
                </div>
              </div>
              <div>
                <div className="eyebrow">Доля партнёра</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {CONFIG.partnerSharePercent}%
                </div>
              </div>
            </div>
            <p className="muted mt-3 text-xs">
              {CONFIG.partnerSharePercent}% от каждого пополнения игрока, который ввёл ваш код,
              приходят вам на баланс автоматически — в момент, когда администрация подтверждает
              его заявку.
            </p>
            <ul className="muted mt-4 grid gap-1 text-sm sm:grid-cols-2">
              {promo.activations.slice(0, 10).map((activation) => (
                <li key={`${activation.user.login}-${activation.createdAt.toISOString()}`}>
                  {activation.user.login} — {activation.createdAt.toLocaleDateString("ru")}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      {promo && (
        <Reveal delay={100}>
          <section className="panel p-5 sm:p-6">
            <p className="eyebrow">Ссылка для описания канала</p>
            <h2 className="mt-1 text-lg font-semibold">Регистрация с вашим кодом</h2>
            <p className="muted mt-2 text-sm">
              Игрок переходит по ссылке и попадает на регистрацию, где ваш код уже вписан —
              вводить руками ничего не нужно, и код закрепляется за аккаунтом навсегда.
            </p>
            <div className="mt-4">
              <CopyField value={`${origin}/r/${promo.code}`} label="ref" />
            </div>
          </section>
        </Reveal>
      )}

      {promo && (
        <Reveal delay={110}>
          <section className="panel p-5 sm:p-6">
            <p className="eyebrow">Готовый баннер</p>
            <h2 className="mt-1 text-lg font-semibold">Картинка с вашим промокодом</h2>
            <p className="muted mt-2 mb-4 text-sm">
              Ваш код подставлен в макет автоматически. Скачивайте и ставьте в шапку канала,
              в описание видео или в пост — ничего дорисовывать не нужно.
            </p>
            <PartnerBanner
              code={promo.code}
              rewardVc={promo.rewardVc}
              requiredLevel={promo.requiredLevel}
            />
          </section>
        </Reveal>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Reveal delay={120}>
          <section className="panel h-full p-6">
            <h2 className="font-semibold">Операции</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2">{tx.type}</td>
                    <td
                      className="tabular-nums"
                      style={{ color: tx.amount < 0 ? "var(--danger)" : "var(--mint)" }}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount}
                    </td>
                    <td className="muted text-right text-xs">{tx.createdAt.toLocaleString("ru")}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td className="muted py-2">Пока пусто</td>
                  </tr>
                )}
              </tbody>
            </table>
            {wagered > 0 && (
              <p className="muted mt-4 text-sm">
                В играх поставлено {wagered} VC, итог {net > 0 ? "+" : ""}
                {net} VC
              </p>
            )}
          </section>
        </Reveal>

        <Reveal delay={150}>
          <section className="panel h-full p-6">
            <h2 className="font-semibold">Наказания</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {punishments.map((punishment) => (
                <li key={punishment.id} className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
                  <span style={{ color: punishment.active ? "var(--danger)" : "var(--muted)" }}>
                    {punishment.type}
                  </span>{" "}
                  — {punishment.reason}
                  <span className="muted"> · {punishment.issuedAt.toLocaleDateString("ru")}</span>
                </li>
              ))}
              {punishments.length === 0 && <li className="muted">Чисто</li>}
            </ul>

            {cosmetics.length > 0 && (
              <>
                <h3 className="mt-6 font-semibold">Косметика</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cosmetics.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full px-3 py-1 text-xs"
                      style={{ background: "var(--panel-strong)", border: "1px solid var(--border)" }}
                    >
                      {item.key}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>
        </Reveal>
      </div>
    </div>
  );
}
