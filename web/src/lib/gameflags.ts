import { db } from "./db";
import { audit } from "./audit";
import type { LiveGame } from "@prisma/client";

export type GameFlags = { ROULETTE: boolean; CRASH: boolean };

const KEY = "games";
const DEFAULTS: GameFlags = { ROULETTE: true, CRASH: true };

export const GAME_LABEL: Record<LiveGame, string> = {
  ROULETTE: "Рулетка",
  CRASH: "Краш",
};

/**
 * Какие мини-игры сейчас открыты. Хранится в настройках рядом с техработами:
 * выключать игру должно быть можно на ходу, без пересборки сайта.
 */
export async function getGameFlags(): Promise<GameFlags> {
  try {
    const setting = await db.setting.findUnique({ where: { key: KEY } });
    const value = (setting?.value ?? {}) as Partial<GameFlags>;
    return {
      ROULETTE: value.ROULETTE !== false,
      CRASH: value.CRASH !== false,
    };
  } catch {
    // База недоступна — не роняем страницу, считаем игры открытыми.
    return DEFAULTS;
  }
}

export async function gameEnabled(game: LiveGame): Promise<boolean> {
  const flags = await getGameFlags();
  return flags[game];
}

export async function setGameFlag(params: {
  game: LiveGame;
  enabled: boolean;
  adminId: string;
}): Promise<GameFlags> {
  const current = await getGameFlags();
  const next: GameFlags = { ...current, [params.game]: params.enabled };

  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next, updatedById: params.adminId },
    update: { value: next, updatedById: params.adminId },
  });
  await audit({
    actorId: params.adminId,
    action: params.enabled ? "admin.game.enable" : "admin.game.disable",
    meta: { game: params.game },
  });

  return next;
}
