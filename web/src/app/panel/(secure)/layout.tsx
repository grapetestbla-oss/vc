import Link from "next/link";
import { redirect } from "next/navigation";
import { panelAccess } from "@/lib/panel";
import { ADMIN_LEVELS } from "@/lib/config";
import PanelNav from "@/components/PanelNav";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/panel", label: "Обзор", level: 3 },
  { href: "/panel/users", label: "Аккаунты", level: 3 },
  { href: "/panel/logs", label: "Логи", level: 3 },
  { href: "/panel/flags", label: "Срабатывания", level: 3 },
  { href: "/panel/promos", label: "Промо и бонусы", level: 3 },
  { href: "/panel/news", label: "Новости", level: 5 },
  { href: "/panel/staff", label: "Персонал", level: 5 },
  { href: "/panel/security", label: "Безопасность", level: 3 },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const access = await panelAccess(3);

  if (!access.ok) {
    if (access.reason === "needs_verify") redirect("/panel/login");
    if (access.reason === "anonymous") redirect("/login?next=/panel");
    redirect("/");
  }

  const admin = access.user;
  const items = NAV.filter((item) => admin.adminLevel >= item.level);

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="panel h-fit p-4 md:sticky md:top-24 md:w-56">
        <div className="mb-4 px-2">
          <p className="eyebrow">Панель</p>
          <p className="mt-1 text-sm font-medium">{admin.login}</p>
          <p className="muted text-xs">{ADMIN_LEVELS[admin.adminLevel]?.title}</p>
        </div>
        <PanelNav items={items} />
        <Link href="/" className="muted mt-4 block px-3 text-xs hover:text-white">
          ← на сайт
        </Link>
      </aside>

      <div className="min-w-0 flex-1 fade-up">{children}</div>
    </div>
  );
}
