import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { ADMIN_LEVELS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const admin = await requireAdmin(5);
  if (!admin) return <p className="muted">Раздел доступен только chief administrator.</p>;

  const staff = await db.user.findMany({
    where: { adminLevel: { gt: 0 } },
    orderBy: { adminLevel: "desc" },
  });

  return (
    <div className="panel p-6">
      <h1 className="mb-4 text-xl font-semibold">Персонал</h1>
      <p className="muted mb-4 text-sm">
        Уровень выдаётся в карточке игрока. Здесь — кто сейчас с админкой.
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
                <Link href={`/admin/users/${member.id}`} className="underline">
                  {member.login}
                </Link>
              </td>
              <td>
                {member.adminLevel} — {ADMIN_LEVELS[member.adminLevel]?.title}
              </td>
              <td>{ADMIN_LEVELS[member.adminLevel]?.prefix ?? "—"}</td>
              <td className="muted">{member.lastSeenAt?.toLocaleString("ru") ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
