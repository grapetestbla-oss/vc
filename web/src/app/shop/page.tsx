import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { levelFromPlaytime } from "@/lib/levels";
import { CATEGORY_LABEL, listShopItems } from "@/lib/shop";
import ShopBuy from "@/components/ShopBuy";
import Reveal from "@/components/Reveal";

export const dynamic = "force-dynamic";

export const metadata = { title: "Магазин — VanillaCraft" };

export default async function ShopPage() {
  const user = await currentUser();
  const [items, purchases] = await Promise.all([
    listShopItems(),
    user
      ? db.shopPurchase.findMany({ where: { userId: user.id } })
      : Promise.resolve([]),
  ]);

  const owned = new Map(purchases.map((purchase) => [purchase.itemKey, purchase]));
  const level = user ? levelFromPlaytime(user.playtimeSec) : 0;

  const categories = [...new Set(items.map((item) => item.category))];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">
          {user ? `Баланс: ${user.balanceVc.toLocaleString("ru")} VC` : "Магазин за VanillaCoins"}
        </p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Магазин</h1>
        <p className="fade-up muted max-w-2xl">
          Здесь продаются удобства, а не преимущество: ни оружия, ни ресурсов, ни защиты в бою.
          Всё покупается за VC и работает прямо в игре — команды включаются сразу после покупки.
        </p>
      </header>

      {categories.map((category) => (
        <section key={category} className="space-y-4">
          <h2 className="text-xl font-semibold">{CATEGORY_LABEL[category] ?? category}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items
              .filter((item) => item.category === category)
              .map((item, index) => {
                const purchase = owned.get(item.key);
                const locked = level < item.requiredLevel;
                const alreadyPermanent = Boolean(purchase?.permanent);
                const disabled = !user || locked || alreadyPermanent;
                const hint = !user
                  ? "Войдите, чтобы купить"
                  : locked
                    ? `Нужен уровень ${item.requiredLevel}`
                    : alreadyPermanent
                      ? "Уже куплено навсегда"
                      : null;

                return (
                  <Reveal key={item.key} delay={index * 60} className="h-full">
                    <article className="panel panel-hover flex h-full flex-col p-5 sm:p-6">
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      <div
                        className="mt-2 self-start rounded-full px-3 py-1 text-sm font-semibold"
                        style={{ background: "rgba(245,196,81,0.1)", color: "var(--gold)" }}
                      >
                        {item.priceVc.toLocaleString("ru")} VC
                      </div>
                      <p className="muted mt-2 flex-1 text-sm">{item.description}</p>

                      <div className="muted mt-4 text-xs">
                        {item.kind === "PERMANENT"
                          ? "Навсегда"
                          : `${item.charges} использований за покупку`}
                        {purchase && !purchase.permanent && ` · у вас осталось ${purchase.chargesLeft}`}
                        {purchase?.permanent && " · куплено"}
                      </div>

                      {user ? (
                        <ShopBuy
                          itemKey={item.key}
                          priceVc={item.priceVc}
                          disabled={disabled}
                          hint={hint}
                        />
                      ) : (
                        <Link href="/login?next=/shop" className="btn mt-4 w-full text-center">
                          Войти
                        </Link>
                      )}
                    </article>
                  </Reveal>
                );
              })}
          </div>
        </section>
      ))}

      <Reveal>
        <p className="muted text-sm">
          Не хватает VC? <Link href="/topup" className="underline hover:text-white">Пополните баланс</Link>{" "}
          или откройте бесплатный кейс. Купленное нельзя передать другому игроку и вернуть деньгами.
        </p>
      </Reveal>
    </div>
  );
}
