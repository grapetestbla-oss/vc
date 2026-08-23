import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function TopUpPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="panel space-y-4 p-6">
      <h1 className="text-2xl font-bold">Пополнение</h1>
      <p className="muted text-sm">
        Курс: {CONFIG.rubPer100Vc} ₽ за 100 VC. Платёжный провайдер ещё не подключён —
        заявка создаётся вручную и подтверждается администрацией.
      </p>
      <p className="muted text-sm">
        VanillaCoins нельзя вывести обратно в деньги или передать другому игроку.
      </p>
    </div>
  );
}
