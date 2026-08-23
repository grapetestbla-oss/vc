"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PanelNav({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active = item.href === "/panel" ? pathname === "/panel" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative shrink-0 rounded-lg px-3 py-2 text-sm transition-all duration-300"
            style={{
              color: active ? "var(--text)" : "var(--muted)",
              background: active ? "var(--panel-strong)" : "transparent",
            }}
          >
            <span
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-transform duration-300"
              style={{
                background: "var(--gold)",
                transform: active ? "scaleY(1)" : "scaleY(0)",
              }}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
