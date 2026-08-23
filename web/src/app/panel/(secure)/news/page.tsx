import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import NewsEditor from "@/components/NewsEditor";

export const dynamic = "force-dynamic";

export default async function PanelNewsPage() {
  const admin = await requirePanel(5);
  if (!admin) {
    return <p className="muted">Публиковать новости может только chief administrator.</p>;
  }

  const items = await db.news.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Публикации</p>
        <h1 className="text-2xl font-bold tracking-tight">Новости</h1>
        <p className="muted mt-1 text-sm">
          Новость появляется в разделе «Новости» на сайте. С галочкой «объявить в
          игре» плагин заберёт её и разошлёт в чат — один раз, даже если сервер
          перезапустится.
        </p>
      </div>

      <NewsEditor
        items={items.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          summary: item.summary,
          published: item.published,
          pinned: item.pinned,
          broadcast: item.broadcast,
          broadcastedAt: item.broadcastedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
