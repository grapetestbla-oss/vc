import { requirePanel } from "@/lib/panel";
import {
  ReleaseError,
  canRelease,
  defaultBranch,
  recentReleases,
  releaseLogins,
  requestRelease,
} from "@/lib/release";
import { isStaging } from "@/lib/staging";

/** История выкаток и то, доступна ли кнопка этому администратору. */
export async function GET() {
  const admin = await requirePanel(5, "release.publish");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  return Response.json({
    allowed: canRelease(admin.login),
    logins: releaseLogins(),
    branch: defaultBranch(),
    staging: isStaging(),
    agentReady: Boolean(process.env.DEPLOY_AGENT_TOKEN),
    releases: await recentReleases(),
  });
}

/** Постановка выкатки в очередь. Работу делает агент на VPS. */
export async function POST(request: Request) {
  const admin = await requirePanel(5, "release.publish");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  // Технический сайт выкатывать боевой не должен: его база отдельная, и агент
  // боевого сервера в неё не смотрит — задача просто повисла бы навсегда.
  if (isStaging()) {
    return Response.json(
      { error: "Выкатка запускается из панели основного сайта, а не отсюда" },
      { status: 400 },
    );
  }

  const { branch, seedCatalogue, restartGame, note } = (await request.json()) as {
    branch?: string;
    seedCatalogue?: boolean;
    restartGame?: boolean;
    note?: string;
  };

  try {
    const release = await requestRelease({
      user: admin,
      branch,
      seedCatalogue: seedCatalogue === true,
      restartGame: restartGame === true,
      note: note ?? "",
    });
    return Response.json({ ok: true, release });
  } catch (error) {
    if (error instanceof ReleaseError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
