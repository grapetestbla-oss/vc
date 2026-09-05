import Link from "next/link";
import { redirect } from "next/navigation";
import { panelAccess } from "@/lib/panel";
import PanelNav from "@/components/PanelNav";
import { rankOf } from "@/lib/ranks";

export const dynamic = "force-dynamic";

/** Пункт меню виден тому, у чьего ранга есть право на этот раздел. */
const NAV = [
  { href: "/panel", label: "Обзор", permission: "panel.view" },
  { href: "/panel/users", label: "Аккаунты", permission: "users.view" },
  { href: "/panel/logs", label: "Логи", permission: "logs.view" },
  { href: "/panel/flags", label: "Срабатывания", permission: "flags.view" },
  { href: "/panel/promos", label: "Промо и бонусы", permission: "promos.view" },
  { href: "/panel/partners", label: "Заявки партнёров", permission: "partners.review" },
  { href: "/panel/payments", label: "Пополнения", permission: "payments.review" },
  { href: "/panel/payments/providers", label: "Платёжные системы", permission: "payments.providers" },
  { href: "/panel/shop", label: "Магазин", permission: "shop.manage" },
  { href: "/panel/appeals", label: "Разбаны", permission: "appeals.review" },
  { href: "/panel/tickets", label: "Обращения", permission: "tickets.answer" },
  { href: "/panel/news", label: "Новости", permission: "news.manage" },
  { href: "/panel/server", label: "Сервер", permission: "server.control" },
  { href: "/panel/giveaways", label: "Розыгрыши", permission: "giveaways.manage" },
  { href: "/panel/games", label: "Мини-игры", permission: "games.toggle" },
  { href: "/panel/purge", label: "Судная ночь", permission: "purge.toggle" },
  { href: "/panel/maintenance", label: "Техработы", permission: "maintenance.toggle" },
  { href: "/panel/ranks", label: "Ранги и права", permission: "ranks.manage" },
  { href: "/panel/staff", label: "Персонал", permission: "users.staff" },
  { href: "/panel/security", label: "Безопасность", permission: "security.view" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const access = await panelAccess(3);

  if (!access.ok) {
    if (access.reason === "needs_verify") redirect("/panel/login");
    if (access.reason === "anonymous") redirect("/login?next=/panel");
    redirect("/");
  }

  const admin = access.user;
  const rank = await rankOf(admin.adminLevel);
  const items = NAV.filter((item) => rank.permissions.includes(item.permission));

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="panel h-fit p-4 md:sticky md:top-24 md:w-56">
        <div className="mb-4 px-2">
          <p className="eyebrow">Панель</p>
          <p className="mt-1 text-sm font-medium">{admin.login}</p>
          <p className="muted text-xs">{rank.title}</p>
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
