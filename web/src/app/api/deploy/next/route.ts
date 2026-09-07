import { agentTokenValid, claimRelease } from "@/lib/release";

/**
 * Агент выкатки спрашивает, есть ли работа. Отвечаем не сессией, а отдельным
 * токеном: агент — это скрипт на VPS, у него нет ни браузера, ни cookie.
 */
export async function POST(request: Request) {
  if (!agentTokenValid(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const release = await claimRelease();
  if (!release) return Response.json({ release: null });

  return Response.json({
    release: {
      id: release.id,
      branch: release.branch,
      seedCatalogue: release.seedCatalogue,
      restartGame: release.restartGame,
    },
  });
}
