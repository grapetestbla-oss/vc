import { requirePanel } from "@/lib/panel";
import { canRelease, defaultBranch, recentReleases, releaseLogins } from "@/lib/release";
import { isStaging } from "@/lib/staging";
import ReleaseControl from "@/components/ReleaseControl";

export const dynamic = "force-dynamic";

export default async function PanelReleasePage() {
  const admin = await requirePanel(5, "release.publish");
  if (!admin) return null;

  const releases = await recentReleases();
  const staging = isStaging();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только {releaseLogins().join(", ")}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Выкатка</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Кнопка ставит задачу в очередь, а работу делает агент на самом VPS: он раз в минуту
          спрашивает сайт, нет ли выкатки, и запускает скрипты. Наоборот — чтобы сайт сам звал
          docker и git — сделано быть не может: это открыло бы выполнение команд на сервере из
          браузера.
        </p>
      </div>

      {staging ? (
        <section className="panel p-5 sm:p-6">
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            Это технический сайт. Боевой выкатывают из панели основного сайта: у стенда своя база,
            и агент боевого сервера в неё не смотрит — задача повисла бы навсегда.
          </p>
        </section>
      ) : (
        <section className="panel p-5 sm:p-6">
          <ReleaseControl
            allowed={canRelease(admin.login)}
            logins={releaseLogins()}
            branch={defaultBranch()}
            agentReady={Boolean(process.env.DEPLOY_AGENT_TOKEN)}
            releases={releases.map((release) => ({
              ...release,
              createdAt: release.createdAt.toISOString(),
              finishedAt: release.finishedAt?.toISOString() ?? null,
            }))}
          />
        </section>
      )}
    </div>
  );
}
