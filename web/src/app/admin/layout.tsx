import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { ADMIN_LEVELS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(3);
  if (!admin) redirect("/");

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center gap-4 p-4">
        <span className="font-semibold" style={{ color: "var(--gold)" }}>
          Админ-панель
        </span>
        <Link href="/admin">Обзор</Link>
        <Link href="/admin/users">Аккаунты</Link>
        <Link href="/admin/logs">Логи</Link>
        <Link href="/admin/flags">Срабатывания</Link>
        <Link href="/admin/promos">Промо и бонусы</Link>
        {admin.adminLevel >= 5 && <Link href="/admin/staff">Персонал</Link>}
        <span className="muted ml-auto text-sm">
          {admin.login} · {ADMIN_LEVELS[admin.adminLevel]?.title}
        </span>
      </div>
      {children}
    </div>
  );
}
