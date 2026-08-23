import Link from "next/link";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { levelFromPlaytime } from "@/lib/levels";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await requirePanel(3);
  if (!admin) return null;
  const { q } = await searchParams;

  const users = await db.user.findMany({
    where: q ? { OR: [{ login: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { lastSeenAt: "desc" },
    take: 50,
  });

  return (
    <div className="panel p-6">
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q ?? ""} className="input max-w-sm" placeholder="Логин или почта" />
        <button className="btn">Искать</button>
      </form>

      <table className="w-full text-sm">
        <thead className="muted text-left">
          <tr>
            <th className="py-2">Логин</th>
            <th>Уровень</th>
            <th>Админка</th>
            <th>Баланс</th>
            <th>Последний вход</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-2">
                <Link href={`/panel/users/${user.id}`} className="underline">
                  {user.login}
                </Link>
              </td>
              <td>{levelFromPlaytime(user.playtimeSec)}</td>
              <td>{user.adminLevel || "—"}</td>
              <td>{user.balanceVc} VC</td>
              <td className="muted">{user.lastSeenAt?.toLocaleString("ru") ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
