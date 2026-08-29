import Link from "next/link";
import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  const admin = await requirePanel(3, "flags.view");
  if (!admin) return null;

  const flags = await db.suspiciousFlag.findMany({
    where: { resolved: false },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { user: { select: { id: true, login: true } } },
  });

  return (
    <div className="panel p-6">
      <h1 className="mb-4 text-xl font-semibold">Подозрительные срабатывания</h1>
      <ul className="space-y-3 text-sm">
        {flags.map((flag) => (
          <li key={flag.id} className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <span className={flag.severity >= 3 ? "text-red-400" : "text-yellow-400"}>
              {flag.kind}
            </span>{" "}
            ·{" "}
            <Link href={`/panel/users/${flag.user.id}`} className="underline">
              {flag.user.login}
            </Link>
            <span className="muted"> · {flag.createdAt.toLocaleString("ru")}</span>
            <pre className="muted mt-1 overflow-x-auto text-xs">{JSON.stringify(flag.details)}</pre>
          </li>
        ))}
        {flags.length === 0 && <li className="muted">Чисто</li>}
      </ul>
    </div>
  );
}
