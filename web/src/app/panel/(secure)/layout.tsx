import Link from "next/link";
import { redirect } from "next/navigation";
import { panelAccess } from "@/lib/panel";
import { ADMIN_LEVELS } from "@/lib/config";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/panel", label: "Обзор", level: 3 },
  { href: "/panel/users", label: "Аккаунты", level: 3 },
  { href: "/panel/logs", label: "Логи", level: 3 },
  { href: "/panel/flags", label: "Срабатывания", level: 3 },
  { href: "/panel/promos", label: "Промо и бонусы", level: 3 },
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

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="panel h-fit p-4 md:w-56">
        <div className="mb-4">
          <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
            Панель
          </div>
          <div className="muted text-xs">
            {admin.login} · {ADMIN_LEVELS[admin.adminLevel]?.title}
          </div>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.filter((item) => admin.adminLevel >= item.level).map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-2 py-1 hover:bg-white/5">
              {item.label}
            </Link>
          ))}
          <Link href="/" className="muted mt-3 rounded px-2 py-1 text-xs hover:bg-white/5">
            ← на сайт
          </Link>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
