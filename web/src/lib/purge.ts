import { db } from "./db";
import { applyTransaction } from "./economy";
import { audit } from "./audit";

/**
 * Судная ночь.
 *
 * Пока режим включён, сервер переводит всех в режим приключения (ломать и
 * ставить нельзя, драться — можно), а смерть стоит половины баланса. Состояние
 * живёт в настройках рядом с техработами: включать и выключать его нужно на
 * ходу, без пересборки сайта.
 */

const KEY = "purge";

export type Purge = {
  enabled: boolean;
  /** Сколько процентов баланса теряет погибший. */
  dropPercent: number;
  /** Когда включили. */
  since: number | null;
  /** Когда режим сам себя выключит. null — до ручного выключения. */
  until: number | null;
};

/** Доля баланса, которую теряет погибший. */
export function dropPercent(): number {
  const value = Number.parseInt(process.env.PURGE_DROP_PERCENT ?? "", 10);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : 50;
}

function off(): Purge {
  return { enabled: false, dropPercent: dropPercent(), since: null, until: null };
}

/**
 * Текущее состояние. Срок окончания проверяем при чтении, а не заданием по
 * расписанию: ночь заканчивается в шесть утра, и надеяться, что кто-то в это
 * время нажмёт кнопку, не стоит.
 */
export async function getPurge(): Promise<Purge> {
  let setting;
  try {
    setting = await db.setting.findUnique({ where: { key: KEY } });
  } catch {
    // База недоступна — режим считаем выключенным: лучше обычная игра, чем
    // отобранные по ошибке VC.
    return off();
  }
  if (!setting) return off();

  const value = setting.value as Partial<Purge> | null;
  if (!value?.enabled) return off();

  const until = typeof value.until === "number" ? value.until : null;
  if (until !== null && Date.now() >= until) return off();

  return {
    enabled: true,
    dropPercent: dropPercent(),
    since: typeof value.since === "number" ? value.since : setting.updatedAt.getTime(),
    until,
  };
}

export async function setPurge(params: {
  enabled: boolean;
  until: number | null;
  adminId: string;
}): Promise<Purge> {
  const value: Purge = {
    enabled: params.enabled,
    dropPercent: dropPercent(),
    since: params.enabled ? Date.now() : null,
    until: params.enabled ? params.until : null,
  };

  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: params.adminId },
    update: { value, updatedById: params.adminId },
  });
  await audit({
    actorId: params.adminId,
    action: params.enabled ? "admin.purge.on" : "admin.purge.off",
    meta: { until: params.until },
  });

  return params.enabled ? getPurge() : value;
}

export type PurgeLoss = {
  /** Сколько потерял погибший. */
  lost: number;
  /** Сколько досталось убийце. 0 — умер сам, VC сгорели. */
  taken: number;
  /** Ник убийцы, если это был игрок. */
  killer: string | null;
  /** Остаток на счету погибшего. */
  balance: number;
};

/**
 * Смерть в судную ночь. Половину баланса погибший теряет всегда; убийце она
 * достаётся, только если это был игрок — иначе VC сгорают.
 *
 * Считает сайт, а не плагин: у плагина нет ни баланса, ни права его менять, а
 * две смерти подряд не должны списать больше, чем есть на счету.
 */
export async function chargeDeath(victimLogin: string, killerLogin?: string | null): Promise<PurgeLoss | null> {
  const purge = await getPurge();
  if (!purge.enabled) return null;

  const victim = await db.user.findUnique({
    where: { login: victimLogin },
    select: { id: true, balanceVc: true },
  });
  if (!victim) return null;

  const lost = Math.floor((victim.balanceVc * purge.dropPercent) / 100);
  if (lost <= 0) {
    return { lost: 0, taken: 0, killer: null, balance: victim.balanceVc };
  }

  // Убийцу ищем до списания: если его нет в базе, VC всё равно сгорят, но
  // сообщать о награде некому.
  const killer =
    killerLogin && killerLogin !== victimLogin
      ? await db.user.findUnique({ where: { login: killerLogin }, select: { id: true, login: true } })
      : null;

  const balance = await applyTransaction({
    userId: victim.id,
    type: "EVENT",
    amount: -lost,
    meta: { reason: "purge_death", killer: killer?.login ?? null },
  });

  if (killer) {
    await applyTransaction({
      userId: killer.id,
      type: "EVENT",
      amount: lost,
      meta: { reason: "purge_kill", victim: victimLogin },
    });
  }

  return { lost, taken: killer ? lost : 0, killer: killer?.login ?? null, balance };
}
