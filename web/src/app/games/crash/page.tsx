import { redirect } from "next/navigation";
import CrashGame from "@/components/CrashGame";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CrashPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="panel space-y-4 p-6">
      <h1 className="text-2xl font-bold">Краш</h1>
      <p className="muted text-sm">Баланс: {user.balanceVc} VC.</p>
      <CrashGame />
    </div>
  );
}
