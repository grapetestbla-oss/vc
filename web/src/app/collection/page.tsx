import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import CosmeticCard from "@/components/CosmeticCard";
import Reveal from "@/components/Reveal";
import { KIND_LABEL, rarityColor } from "@/lib/rarity";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/collection");

  const [catalogue, owned, collections] = await Promise.all([
    db.cosmetic.findMany({ orderBy: [{ kind: "asc" }, { rarity: "asc" }] }),
    db.userCosmetic.findMany({ where: { userId: user.id } }),
    db.collection.findMany({
      include: {
        items: { where: { obtainable: true }, select: { key: true, name: true } },
        reward: true,
      },
    }),
  ]);

  const ownedMap = new Map(owned.map((item) => [item.key, item]));
  const byKind = new Map<string, typeof catalogue>();
  for (const cosmetic of catalogue) {
    const list = byKind.get(cosmetic.kind) ?? [];
    list.push(cosmetic);
    byKind.set(cosmetic.kind, list);
  }

  const ownedCount = owned.length;
  const totalCount = catalogue.filter((item) => item.obtainable).length;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow fade-up">Первый сезон</p>
        <h1 className="fade-up text-4xl font-bold tracking-tight md:text-5xl">Коллекция</h1>
        <p className="fade-up muted max-w-2xl">
          Собрано {ownedCount} из {totalCount} предметов сезона. Осколков:{" "}
          <span style={{ color: "var(--mint)" }}>{user.shards.toLocaleString("ru")}</span>. Один
          активный предмет на каждый вид — снимите текущий, чтобы надеть другой.
        </p>
        <p className="fade-up">
          <Link href="/cases" className="btn-ghost text-sm">К кейсам</Link>
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {collections.map((collection, index) => {
          const done = collection.items.filter((item) => ownedMap.has(item.key)).length;
          const complete = done === collection.items.length && collection.items.length > 0;
          return (
            <Reveal key={collection.key} delay={index * 70}>
              <div className="panel p-6">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold">{collection.name}</h2>
                  <span className="muted text-sm tabular-nums">
                    {done} / {collection.items.length}
                  </span>
                </div>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-1000"
                    style={{
                      width: `${(done / Math.max(1, collection.items.length)) * 100}%`,
                      background: complete
                        ? "linear-gradient(90deg, var(--mint), var(--gold))"
                        : "var(--gold)",
                    }}
                  />
                </div>
                {collection.reward && (
                  <p className="muted mt-3 text-sm">
                    Награда:{" "}
                    <span style={{ color: rarityColor(collection.reward.rarity) }}>
                      {collection.reward.name}
                    </span>
                    {complete && ownedMap.has(collection.reward.key) && " — получена"}
                  </p>
                )}
                <p className="muted mt-2 text-xs">
                  {collection.items.map((item) => item.name).join(" · ")}
                </p>
              </div>
            </Reveal>
          );
        })}
      </section>

      {[...byKind.entries()].map(([kind, items], index) => (
        <section key={kind} className="space-y-4">
          <Reveal delay={index * 40}>
            <h2 className="text-2xl font-bold tracking-tight">{KIND_LABEL[kind] ?? kind}</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((cosmetic, itemIndex) => {
              const ownedItem = ownedMap.get(cosmetic.key);
              return (
                <Reveal key={cosmetic.key} delay={itemIndex * 40}>
                  <CosmeticCard
                    item={{
                      key: cosmetic.key,
                      name: cosmetic.name,
                      description: cosmetic.description,
                      kind: cosmetic.kind,
                      rarity: cosmetic.rarity,
                      owned: Boolean(ownedItem),
                      equipped: ownedItem?.equipped ?? false,
                      serial: ownedItem?.serial ?? null,
                      serialLimit: cosmetic.serialLimit,
                      shardPrice: cosmetic.shardPrice,
                      obtainable: cosmetic.obtainable,
                    }}
                  />
                </Reveal>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
