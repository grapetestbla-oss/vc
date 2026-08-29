import Link from "next/link";
import { requirePanel } from "@/lib/panel";
import { SHOP_FEATURES, shopCatalogue } from "@/lib/shopadmin";
import ShopAdmin, { type AdminShopItem } from "@/components/ShopAdmin";

export const dynamic = "force-dynamic";

export default async function PanelShopPage() {
  const admin = await requirePanel(5, "shop.manage");
  if (!admin) return null;

  const catalogue = await shopCatalogue();
  const items: AdminShopItem[] = catalogue.map((item) => {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    // Возможность правится отдельным полем, поэтому в «доп. настройках»
    // показываем всё остальное — иначе она задваивалась бы.
    const { feature: _feature, ...extra } = payload;
    return {
      key: item.key,
      title: item.title,
      description: item.description,
      category: item.category,
      priceVc: item.priceVc,
      kind: item.kind,
      charges: item.charges,
      feature: String(item.feature ?? ""),
      extra: Object.keys(extra).length ? JSON.stringify(extra, null, 2) : "",
      requiredLevel: item.requiredLevel,
      sort: item.sort,
      active: item.active,
      buyers: item.buyers,
      boughtTimes: item.boughtTimes,
      earnedVc: item.earnedVc,
    };
  });

  const earned = items.reduce((sum, item) => sum + item.earnedVc, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Магазин</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Цены, описания и состав витрины меняются здесь и применяются сразу. «Возможность» — то,
          что ищет плагин: {SHOP_FEATURES.join(", ")}. Новую возможность сначала учат плагин, иначе
          товар купят, а команда не заработает.
        </p>
        <p className="muted mt-2 text-sm">
          Товаров: <b>{items.length}</b>, из них на витрине{" "}
          <b>{items.filter((item) => item.active).length}</b> · всего продано на{" "}
          <b>{earned.toLocaleString("ru")} VC</b> ·{" "}
          <Link href="/shop" className="underline hover:text-white">
            посмотреть витрину →
          </Link>
        </p>
        <p className="muted mt-2 text-sm">
          Купленный товар удалить нельзя — только убрать с витрины: удаление отняло бы у игроков
          оплаченные заряды. Цена меняется только для новых покупок.
        </p>
      </div>

      <ShopAdmin items={items} features={[...SHOP_FEATURES]} />
    </div>
  );
}
