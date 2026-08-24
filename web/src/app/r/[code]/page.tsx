import { redirect } from "next/navigation";

/**
 * Короткая ссылка партнёра: vanillacraft.click/r/КОД. Ведёт на регистрацию с
 * уже подставленным промокодом — игроку не нужно ничего вводить руками.
 */
export default async function ReferralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const clean = decodeURIComponent(code).trim().slice(0, 32).toUpperCase();
  redirect(`/register?promo=${encodeURIComponent(clean)}`);
}
