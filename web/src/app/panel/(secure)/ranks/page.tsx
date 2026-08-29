import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { listRanks, PERMISSIONS } from "@/lib/ranks";
import RankAdmin, { type RankRow } from "@/components/RankAdmin";

export const dynamic = "force-dynamic";

export default async function PanelRanksPage() {
  const admin = await requirePanel(5, "ranks.manage");
  if (!admin) return null;

  const [ranks, holders] = await Promise.all([
    listRanks(),
    db.user.groupBy({
      by: ["adminLevel"],
      where: { adminLevel: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(holders.map((row) => [row.adminLevel, row._count._all]));
  const rows: RankRow[] = ranks.map((rank) => ({
    ...rank,
    holders: counts.get(rank.level) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Ранги и права</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Название, метка в чате и набор прав правятся здесь и применяются сразу — и на сайте, и в
          игре. Уровень остаётся числом: по нему считается старшинство (наказать можно только того,
          кто ниже) и его же читает плагин.
        </p>
        <p className="muted mt-2 max-w-2xl text-sm">
          Встроенные ранги 1–5 переименовываются, но не удаляются — на них завязаны проверки
          уровня. Новый ранг занимает свободный уровень и получает ровно те права, что отмечены.
          Ранг, на котором есть люди, удалить нельзя: сначала переведите их на другой уровень.
        </p>
      </div>

      <RankAdmin ranks={rows} permissions={PERMISSIONS} ownLevel={admin.adminLevel} />
    </div>
  );
}
