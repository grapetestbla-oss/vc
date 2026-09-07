import Link from "next/link";
import { currentUser } from "@/lib/session";
import { stagingLogins } from "@/lib/staging";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Технический сайт — VanillaCraft",
  robots: { index: false, follow: false },
};

/**
 * Заглушка технического сайта. Показывается всем, кроме тех, кто указан в
 * STAGING_LOGINS: обновления приезжают сюда раньше боевого, и смотреть их
 * посторонним незачем.
 */
export default async function ClosedPage() {
  const user = await currentUser();
  const allowed = stagingLogins();

  return (
    <div className="mx-auto max-w-xl space-y-5 py-24 text-center">
      <p className="eyebrow">Технический сайт</p>
      <h1 className="text-3xl font-bold tracking-tight">Здесь идёт обкатка обновлений</h1>
      <p className="muted">
        Это не основной сайт. Сюда обновления приезжают раньше, чтобы их проверили до выкатки, и
        доступ закрыт для всех, кроме {allowed.length === 1 ? "одного аккаунта" : "нескольких аккаунтов"}.
      </p>
      {user ? (
        <p className="muted text-sm">
          Вы вошли как <span style={{ color: "var(--gold)" }}>{user.login}</span> — этому аккаунту
          стенд не открыт.
        </p>
      ) : (
        <p className="muted text-sm">
          <Link href="/login" className="underline hover:text-white">
            Войдите
          </Link>
          , если стенд открыт вашему аккаунту.
        </p>
      )}
      <p className="pt-4">
        <a className="btn" href="https://vanillacraft.click">
          На основной сайт
        </a>
      </p>
    </div>
  );
}
