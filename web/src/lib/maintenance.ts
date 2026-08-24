import { db } from "./db";
import { audit } from "./audit";

export type Maintenance = {
  enabled: boolean;
  reason: string;
  since: number | null;
};

const KEY = "maintenance";

const OFF: Maintenance = { enabled: false, reason: "", since: null };

/** Текущее состояние техработ. Хранится в настройках, чтобы менять на ходу. */
export async function getMaintenance(): Promise<Maintenance> {
  // Состояние читает корневая раскладка — в том числе на странице 404, которую
  // Next пытается собрать без базы. Недоступная база не должна ронять страницу.
  let setting;
  try {
    setting = await db.setting.findUnique({ where: { key: KEY } });
  } catch {
    return OFF;
  }
  if (!setting) return OFF;
  const value = setting.value as Partial<Maintenance> | null;
  if (!value?.enabled) return OFF;
  return {
    enabled: true,
    reason: typeof value.reason === "string" && value.reason ? value.reason : "Технические работы",
    since: typeof value.since === "number" ? value.since : setting.updatedAt.getTime(),
  };
}

export async function setMaintenance(params: {
  enabled: boolean;
  reason: string;
  adminId: string;
}): Promise<Maintenance> {
  const reason = params.reason.trim().slice(0, 200) || "Технические работы";
  const value: Maintenance = {
    enabled: params.enabled,
    reason,
    since: params.enabled ? Date.now() : null,
  };

  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: params.adminId },
    update: { value, updatedById: params.adminId },
  });
  await audit({
    actorId: params.adminId,
    action: params.enabled ? "admin.maintenance.on" : "admin.maintenance.off",
    meta: { reason },
  });

  return value;
}
