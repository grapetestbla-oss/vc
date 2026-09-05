import { requirePanel } from "@/lib/panel";
import { getPurge } from "@/lib/purge";
import PurgeToggle from "@/components/PurgeToggle";

export const dynamic = "force-dynamic";

export default async function PanelPurgePage() {
  const admin = await requirePanel(5, "purge.toggle");
  if (!admin) return null;

  const purge = await getPurge();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Судная ночь</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Пока режим включён, все игроки переведены в режим приключения: ломать и ставить блоки
          нельзя, драться — можно. Смерть стоит {purge.dropPercent}% баланса; если убил игрок, VC
          достаются ему, если умер сам — сгорают. Администрация со 2 уровня остаётся в наблюдателе,
          заключённые в деморгане играют как обычно — иначе они не смогли бы отрабатывать срок.
        </p>
      </div>

      <section className="panel p-5 sm:p-6">
        <PurgeToggle
          enabled={purge.enabled}
          dropPercent={purge.dropPercent}
          since={purge.since}
          until={purge.until}
        />
      </section>
    </div>
  );
}
