import Link from "next/link";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { listRanks } from "@/lib/ranks";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const admin = await requirePanel(5, "users.staff");
  if (!admin) return <p className="muted">Раздел доступен только chief administrator.</p>;

  const [staff, ranks] = await Promise.all([
    db.user.findMany({ where: { adminLevel: { gt: 0 } }, orderBy: { adminLevel: "desc" } }),
    listRanks(),
  ]);
  // Названия рангов берём из панели: их могли переименовать.
  const byLevel = new Map(ranks.map((rank) => [rank.level, rank]));

  return (
    <div className="panel p-6">
      <h1 className="mb-4 text-xl font-semibold">Персонал</h1>
      <p className="muted mb-4 text-sm">
        Уровень выдаётся в карточке игрока, а названия и права ранга правятся в разделе
        «Ранги и права». Здесь — кто сейчас с админкой.
      </p>
      <table className="w-full text-sm">
        <thead className="muted text-left">
          <tr>
            <th className="py-2">Логин</th>
            <th>Уровень</th>
            <th>Префикс</th>
            <th>Последний вход</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1">
                <Link href={`/panel/users/${member.id}`} className="underline">
                  {member.login}
                </Link>
              </td>
              <td>
                {member.adminLevel} — {byLevel.get(member.adminLevel)?.title ?? "—"}
              </td>
              <td>{byLevel.get(member.adminLevel)?.prefix ?? "—"}</td>
              <td className="muted">{member.lastSeenAt?.toLocaleString("ru") ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
