"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LogoutButton from "./LogoutButton";

const LINKS = [
  { href: "/news", label: "Новости" },
  { href: "/cases", label: "Кейсы" },
  { href: "/shop", label: "Магазин" },
  { href: "/collection", label: "Коллекция" },
  { href: "/games", label: "Игры" },
  { href: "/partners", label: "Партнёрам" },
  { href: "/rules", label: "Правила" },
];

export default function SiteHeader({
  user,
  showGames = true,
}: {
  user: { login: string; balanceVc: number; adminLevel: number } | null;
  showGames?: boolean;
}) {
  const links = LINKS.filter((link) => showGames || link.href !== "/games");

  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className="sticky top-0 z-50 transition-all duration-500"
      style={{
        // Шапка «проявляется» только когда страницу прокрутили.
        background: scrolled ? "rgba(7,8,11,0.72)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
      }}
    >
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Vanilla<span style={{ color: "var(--gold)" }}>Craft</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="relative rounded-lg px-3 py-1.5 text-sm transition-colors"
                style={{ color: active ? "var(--text)" : "var(--muted)" }}
              >
                {link.label}
                <span
                  className="absolute inset-x-3 -bottom-0.5 h-px origin-left transition-transform duration-300"
                  style={{
                    background: "var(--gold)",
                    transform: active ? "scaleX(1)" : "scaleX(0)",
                  }}
                />
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <span
                className="hidden rounded-full px-3 py-1.5 text-sm sm:inline-flex"
                style={{ background: "rgba(245,196,81,0.1)", color: "var(--gold)" }}
              >
                {user.balanceVc.toLocaleString("ru")} VC
              </span>
              <Link href="/cabinet" className="btn-ghost text-sm">
                {user.login}
              </Link>
              {user.adminLevel >= 3 && (
                <Link href="/panel" className="btn-ghost hidden text-sm sm:inline-flex">
                  Панель
                </Link>
              )}
              <LogoutButton className="btn-ghost hidden text-sm md:inline-flex" />
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost text-sm">
                Войти
              </Link>
              <Link href="/register" className="btn text-sm">
                Регистрация
              </Link>
            </>
          )}
          <button
            className="btn-ghost px-3 py-1.5 text-sm md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Меню"
          >
            ☰
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="fade-up border-t px-4 pb-5 md:hidden"
          style={{ borderColor: "var(--border)", background: "rgba(7,8,11,0.96)" }}
        >
          {user && (
            <div className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm" style={{ color: "var(--gold)" }}>
                {user.balanceVc.toLocaleString("ru")} VC
              </span>
              <Link href="/topup" className="btn text-sm">
                Пополнить
              </Link>
            </div>
          )}
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="muted block py-3 text-base">
              {link.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/cabinet" className="muted block py-3 text-base">
                Личный кабинет
              </Link>
              {user.adminLevel >= 3 && (
                <Link href="/panel" className="muted block py-3 text-base">
                  Панель
                </Link>
              )}
              <LogoutButton className="btn-ghost mt-3 w-full justify-center" />
            </>
          ) : (
            <div className="mt-3 flex gap-2">
              <Link href="/login" className="btn-ghost flex-1 justify-center">
                Войти
              </Link>
              <Link href="/register" className="btn flex-1">
                Регистрация
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
