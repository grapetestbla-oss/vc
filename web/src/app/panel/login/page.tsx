import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import PanelLogin from "@/components/PanelLogin";

export const dynamic = "force-dynamic";

/** Страница вне общего layout панели — иначе получился бы редирект в себя. */
export default async function PanelLoginPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/panel");
  if (user.adminLevel < 3) redirect("/");

  return <PanelLogin totpEnabled={Boolean(user.totpEnabledAt)} />;
}
