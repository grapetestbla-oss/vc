import { db } from "./db";
import { audit } from "./audit";
import type { Release, User } from "@prisma/client";

/**
 * Выкатка боевого сайта из панели.
 *
 * Кнопка только ставит задачу в очередь. Делает работу агент на самом VPS: он
 * раз в минуту спрашивает сайт, нет ли задачи, и запускает скрипты выкатки.
 * Наоборот — чтобы сайт сам звал docker и git — сделать нельзя: это открыло бы
 * выполнение команд на хосте из веб-приложения, и любая дыра в сайте
 * превращалась бы в полный доступ к серверу.
 */

/** Ветка, которую выкатываем по умолчанию. */
export function defaultBranch(): string {
  return process.env.RELEASE_BRANCH ?? "claude/minecraft-server-demorgan-16y10o";
}

/**
 * Кому позволено выкатывать. Список задаётся при запуске контейнера, а не
 * правом в базе: выкатка меняет боевой сайт целиком, и открыть её случайной
 * правкой ранга не должно быть возможно.
 */
export function releaseLogins(): string[] {
  return (process.env.RELEASE_LOGINS ?? "rym6a")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);
}

export function canRelease(login: string | null | undefined): boolean {
  if (!login) return false;
  return releaseLogins().includes(login.toLowerCase());
}

export class ReleaseError extends Error {}

/** Токен агента выкатки. Пустой означает, что агент не настроен. */
export function agentTokenValid(request: Request): boolean {
  const expected = process.env.DEPLOY_AGENT_TOKEN ?? "";
  if (!expected) return false;
  const got = request.headers.get("x-deploy-token") ?? "";
  // Длины разные — сравнивать посимвольно нечего, и это не утечка: длина
  // токена секретом не является.
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function requestRelease(params: {
  user: User;
  branch?: string;
  seedCatalogue: boolean;
  restartGame: boolean;
  note: string;
}): Promise<Release> {
  if (!canRelease(params.user.login)) throw new ReleaseError("Выкатка доступна не вам");

  // Две выкатки подряд подрались бы за один рабочий каталог на VPS.
  const busy = await db.release.findFirst({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true, status: true },
  });
  if (busy) throw new ReleaseError("Предыдущая выкатка ещё не закончилась");

  const release = await db.release.create({
    data: {
      branch: (params.branch || defaultBranch()).trim(),
      seedCatalogue: params.seedCatalogue,
      restartGame: params.restartGame,
      note: params.note.trim().slice(0, 300),
      requestedById: params.user.id,
    },
  });

  await audit({
    actorId: params.user.id,
    action: "admin.release.request",
    meta: {
      release: release.id,
      branch: release.branch,
      seedCatalogue: release.seedCatalogue,
      restartGame: release.restartGame,
    },
  });

  return release;
}

/**
 * Отдаёт агенту следующую задачу и сразу помечает её как выполняемую. Смена
 * статуса условная: если задачу успел забрать другой агент, второму не
 * достанется ничего, и одна выкатка не пойдёт дважды.
 */
export async function claimRelease(): Promise<Release | null> {
  const pending = await db.release.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (!pending) return null;

  const claimed = await db.release.updateMany({
    where: { id: pending.id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return db.release.findUnique({ where: { id: pending.id } });
}

export async function finishRelease(params: {
  id: string;
  ok: boolean;
  log: string;
}): Promise<Release | null> {
  const release = await db.release.findUnique({ where: { id: params.id } });
  if (!release || release.status !== "RUNNING") return null;

  return db.release.update({
    where: { id: params.id },
    data: {
      status: params.ok ? "DONE" : "FAILED",
      finishedAt: new Date(),
      // Хвост, а не весь вывод: полный лог сборки — это мегабайты, а видеть
      // нужно то, на чём всё встало.
      log: params.log.slice(-8000),
    },
  });
}

/**
 * Зависшие выкатки. Агент мог упасть вместе с машиной, не отчитавшись, — иначе
 * очередь встала бы навсегда, а кнопка молча отказывала бы.
 */
export async function releaseTimeoutMinutes(): Promise<number> {
  const value = Number.parseInt(process.env.RELEASE_TIMEOUT_MINUTES ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export async function expireStuckReleases(): Promise<number> {
  const limit = new Date(Date.now() - (await releaseTimeoutMinutes()) * 60_000);
  const stuck = await db.release.updateMany({
    where: { status: "RUNNING", startedAt: { lt: limit } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      log: "Агент выкатки не отчитался вовремя. Проверьте его журнал на VPS.",
    },
  });
  return stuck.count;
}

export async function recentReleases(limit = 15) {
  await expireStuckReleases();
  return db.release.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { requestedBy: { select: { login: true } } },
  });
}
