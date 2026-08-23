import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "VanillaCoins",
  description: "Ванильный Minecraft-сервер без приватов",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="ru">
      <body>
        <header className="border-b" style={{ borderColor: "var(--border)" }}>
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold" style={{ color: "var(--gold)" }}>
              VanillaCoins
            </Link>
            <Link href="/cases">Кейсы</Link>
            <Link href="/games">Игры</Link>
            <Link href="/rules">Правила</Link>
            <div className="ml-auto flex items-center gap-3">
              {user ? (
                <>
                  <span className="muted text-sm">{user.balanceVc} VC</span>
                  <Link href="/cabinet" className="btn-ghost text-sm">
                    {user.login}
                  </Link>
                  {user.adminLevel >= 3 && (
                    <Link href="/admin" className="btn-ghost text-sm">
                      Панель
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link href="/login" className="btn-ghost text-sm">Вход</Link>
                  <Link href="/register" className="btn text-sm">Регистрация</Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
