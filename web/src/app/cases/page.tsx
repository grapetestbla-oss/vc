import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import CaseOpener from "@/components/CaseOpener";
import { currentUser } from "@/lib/session";
import Reveal from "@/components/Reveal";
import { translator } from "@/lib/i18n.server";
import { rarityColor } from "@/lib/rarity";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const t = await translator();
  const user = await currentUser();
  const cases = await db.caseType.findMany({
    where: { active: true, OR: [{ availableUntil: null }, { availableUntil: { gt: new Date() } }] },
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
        <p className="eyebrow fade-up">{t("Первый сезон")}</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">{t("Кейсы")}</h1>
        <p className="fade-up muted max-w-2xl">
          {t("Внутри — только то, что видно другим игрокам: шлейфы, ауры, питомцы, шляпы, эффекты входа и метки в мире. Ничего, что даёт преимущество в игре. Шансы указаны честно, дубли возвращаются в VC, а гарант не даёт застрять в невезении.")}
        </p>
        {user && (
          <p className="fade-up text-sm">
            <span style={{ color: "var(--gold)" }}>{user.balanceVc.toLocaleString("ru")} VC</span>

            <span className="muted"> · </span>
            <Link href="/collection" className="muted underline hover:text-white">
              {t("моя коллекция")}
            </Link>
          </p>
        )}
      </header>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cases.map((caseType, index) => {
          const total = caseType.items.reduce((sum, item) => sum + item.weight, 0);
          const pity = pityCounters.find((counter) => counter.caseKey === caseType.key);
          const slots = caseType.items.map((item) => ({
            id: item.id,
            label: item.cosmetic?.name ?? `${item.amount} VC`,
            rarity: item.cosmetic?.rarity ?? "common",
            kind: item.cosmetic?.kind ?? null,
          }));

          const sorted = caseType.items.slice().sort((a, b) => {
            const order = { legendary: 0, epic: 1, rare: 2, common: 3 } as Record<string, number>;
            const left = order[a.cosmetic?.rarity ?? "common"] ?? 3;
            const right = order[b.cosmetic?.rarity ?? "common"] ?? 3;
            return left - right || b.weight - a.weight;
          });

          const accent = caseType.accent ?? "var(--gold)";

          return (
            <Reveal key={caseType.key} delay={index * 60} className="h-full">
              <section
                className="panel flex h-full flex-col overflow-hidden p-0"
                style={{ borderColor: `${accent}33` }}
              >
                {caseType.imageUrl ? (
                  <div className="relative" style={{ background: "#08090a" }}>
                    <Image
                      src={caseType.imageUrl}
                      alt=""
                      width={640}
                      height={420}
                      className="h-auto w-full"
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    />
                    {/* Подпись кейса кладём поверх арта: в самой картинке её нет,
                        иначе она жила бы отдельно от цены и таймера. */}
                    <div
                      className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 pb-3 pt-10"
                      style={{ background: "linear-gradient(to top, #08090aff, #08090a00)" }}
                    >
                      <span className="text-lg font-bold tracking-tight">{caseType.name}</span>
                      <span
                        className="ml-auto rounded-full px-3 py-1 text-sm font-semibold tabular-nums"
                        style={{ background: `${accent}1f`, color: accent }}
                      >
                        {caseType.freeDaily ? t("бесплатно") : `${caseType.priceVc} VC`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-5 pt-5">
                    <span className="text-lg font-bold tracking-tight">{caseType.name}</span>
                    <span
                      className="ml-auto rounded-full px-3 py-1 text-sm font-semibold tabular-nums"
                      style={{ background: `${accent}1f`, color: accent }}
                    >
                      {caseType.freeDaily ? t("бесплатно") : `${caseType.priceVc} VC`}
                    </span>
                  </div>
                )}

                <div className="flex flex-1 flex-col p-5">
                  {caseType.availableUntil && (
                    <p
                      className="mb-2 inline-flex self-start rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: "rgba(255,107,107,0.12)", color: "var(--danger)" }}
                    >
                      {t("до {date}", {
                        date: caseType.availableUntil.toLocaleString("ru", {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Europe/Moscow",
                        }),
                      })}
                    </p>
                  )}
                  <p className="muted text-sm">{caseType.description}</p>

                  {/* Шансы прячем под раскладку: они нужны и обязаны быть
                      честными, но в сетке карточек портят вид длинным списком. */}
                  <details className="mt-4">
                    <summary className="muted cursor-pointer text-sm hover:text-white">
                      {t("Что внутри и с какими шансами")}
                    </summary>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {sorted.map((item) => {
                        const chance = (item.weight / total) * 100;
                        const color = rarityColor(item.cosmetic?.rarity ?? "common");
                        return (
                          <li key={item.id} className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                            />
                            <span style={{ color }}>
                              {item.cosmetic?.name ?? `${item.amount} VC`}
                            </span>
                            {item.cosmetic?.serialLimit && (
                              <span className="muted text-xs">
                                {t("всего {n} шт.", { n: item.cosmetic.serialLimit })}
                              </span>
                            )}
                            <span className="muted ml-auto tabular-nums text-xs">
                              {chance < 1 ? chance.toFixed(2) : chance.toFixed(1)}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>

                  <div className="mt-auto pt-5">
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
                        {t("Войти, чтобы открывать")}
                      </Link>
                    )}
                  </div>
                </div>
              </section>
            </Reveal>
          );
        })}
      </div>

      <Reveal>
        <section className="panel p-6">
          <h2 className="text-xl font-semibold">{t("Как это работает")}</h2>
          <ul className="muted mt-4 grid gap-3 text-sm md:grid-cols-2">
            <li>
              <span style={{ color: "var(--gold)" }}>{t("Гарант.")}</span>{" "}
              {t("Счётчик открытий без легендарки виден прямо на кейсе. Дошёл до предела — легендарка выпадает принудительно, счётчик обнуляется.")}
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>{t("Дубли.")}</span>{" "}
              {t("Уже имеющийся предмет возвращается деньгами: 10 VC за обычный, 30 за редкий, 100 за эпический, 300 за легендарный.")}
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>{t("Прямая покупка.")}</span>{" "}
              {t("Нужный предмет берётся из каталога за VC — без всякой случайности.")}
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>{t("Коллекции.")}</span>{" "}
              {t("Собрали весь набор — получаете предмет, которого нет ни в одном кейсе.")}
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>{t("Экземпляры.")}</span>{" "}
              {t("У части предметов ограниченный тираж: вам достанется номер, и он останется за вами.")}
            </li>
            <li>
              <span style={{ color: "var(--gold)" }}>{t("Честность.")}</span>{" "}
              {t("Каждое открытие подписано хэшем сида — результат нельзя подкрутить задним числом.")}
            </li>
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
