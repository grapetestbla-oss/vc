import { redirect } from "next/navigation";
import RouletteGame from "@/components/RouletteGame";
import { currentUser } from "@/lib/session";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function RoulettePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="panel space-y-4 p-6">
      <h1 className="text-2xl font-bold">Рулетка</h1>
      <p className="muted text-sm">
        Баланс: {user.balanceVc} VC. Шанс выигрыша — {Math.round(CONFIG.rtp * 100)}% делить
        на множитель.
      </p>
      <RouletteGame rtp={CONFIG.rtp} />
    </div>
  );
}
