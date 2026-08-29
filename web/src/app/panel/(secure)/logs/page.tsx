import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";

export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string }>;
}) {
  const admin = await requirePanel(3, "logs.view");
  if (!admin) return null;
  const { action, actor } = await searchParams;

  const logs = await db.auditLog.findMany({
    where: {
      ...(action ? { action: { contains: action } } : {}),
      ...(actor ? { actor: { login: { contains: actor, mode: "insensitive" } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      actor: { select: { login: true } },
      target: { select: { login: true } },
    },
  });

  return (
    <div className="panel p-6">
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="actor" defaultValue={actor ?? ""} className="input max-w-xs" placeholder="Кто" />
        <input name="action" defaultValue={action ?? ""} className="input max-w-xs" placeholder="Действие" />
        <button className="btn">Фильтр</button>
      </form>

      <table className="w-full text-sm">
        <thead className="muted text-left">
          <tr>
            <th className="py-2">Время</th>
            <th>Кто</th>
            <th>Действие</th>
            <th>Над кем</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
              <td className="muted py-1 whitespace-nowrap">{log.createdAt.toLocaleString("ru")}</td>
              <td>{log.actor?.login ?? "система"}</td>
              <td>{log.action}</td>
              <td>{log.target?.login ?? "—"}</td>
              <td className="muted max-w-md truncate">{log.meta ? JSON.stringify(log.meta) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
