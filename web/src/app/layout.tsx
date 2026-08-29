import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { headers } from "next/headers";
import { currentUser } from "@/lib/session";
import { getMaintenance } from "@/lib/maintenance";
import { getGameFlags } from "@/lib/gameflags";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import SiteHeader from "@/components/SiteHeader";
import BackdropLines from "@/components/BackdropLines";
import LangProvider from "@/components/LangProvider";
import { translate } from "@/lib/i18n";
import { getLang } from "@/lib/i18n.server";

const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: "VanillaCraft — ванилла без приватов",
  description:
    "Чистое выживание без китов за донат и приватов. Деморган вместо бана, честные кейсы и мини-игры.",
};

/** Пути, которые работают и во время техработ: без них чиф не сможет войти и всё выключить. */
const ALWAYS_OPEN = ["/login", "/panel", "/maintenance", "/api"];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, maintenance, gameFlags, requestHeaders, lang] = await Promise.all([
    currentUser(),
    getMaintenance(),
    getGameFlags(),
    headers(),
    getLang(),
  ]);
  const t = translate(lang);

  // Когда обе игры выключены, раздела на сайте нет вовсе — ни ссылки, ни страниц.
  const showGames = gameFlags.ROULETTE || gameFlags.CRASH;

  const pathname = requestHeaders.get("x-pathname") ?? "/";
  const blocked =
    maintenance.enabled &&
    (user?.adminLevel ?? 0) < 5 &&
    !ALWAYS_OPEN.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  return (
    <html lang={lang} className={inter.className}>
      <head>
        {/* Ставим метку до первой отрисовки: без JS анимации появления
            выключаются целиком, и контент виден сразу. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>
        <LangProvider lang={lang}>
        <BackdropLines />
        <SiteHeader
          showGames={showGames}
          user={
            user
              ? { login: user.login, balanceVc: user.balanceVc, adminLevel: user.adminLevel }
              : null
          }
        />
        <main className="mx-auto max-w-6xl px-4 py-10">
          {blocked ? <MaintenanceScreen reason={maintenance.reason} /> : children}
        </main>

        <footer className="mt-20 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm">
            <span className="muted">VanillaCraft · vanillacraft.click</span>
            <div className="ml-auto flex flex-wrap gap-4">
              <Link href="/rules" className="muted hover:text-white">{t("Правила")}</Link>
              <Link href="/news" className="muted hover:text-white">{t("Новости")}</Link>
              <Link href="/topup" className="muted hover:text-white">{t("Пополнение")}</Link>
              <Link href="/appeal" className="muted hover:text-white">{t("Разбан")}</Link>
              <Link href="/tickets" className="muted hover:text-white">{t("Поддержка")}</Link>
              <Link href="/terms" className="muted hover:text-white">{t("Соглашение")}</Link>
              <Link href="/privacy" className="muted hover:text-white">{t("Конфиденциальность")}</Link>
            </div>
          </div>
        </footer>
        </LangProvider>
      </body>
    </html>
  );
}
