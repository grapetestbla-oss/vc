/**
 * Управление игровым сервером через клиентский API панели хостинга
 * (Calagopus/Pterodactyl). Ключ лежит только в переменных окружения сайта:
 * он даёт полный доступ к серверу, поэтому в базу и в браузер не попадает.
 */
const BASE = (process.env.GAME_PANEL_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.GAME_PANEL_KEY ?? "";
const SERVER = process.env.GAME_PANEL_SERVER_ID ?? "";

export const POWER_SIGNALS = ["start", "stop", "restart", "kill"] as const;
export type PowerSignal = (typeof POWER_SIGNALS)[number];

export class GamePanelError extends Error {}

export function gamePanelConfigured(): boolean {
  return Boolean(BASE && KEY && SERVER);
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  if (!gamePanelConfigured()) {
    throw new GamePanelError(
      "Панель хостинга не настроена: задайте GAME_PANEL_URL, GAME_PANEL_KEY и GAME_PANEL_SERVER_ID",
    );
  }
  const response = await fetch(`${BASE}/api/client/servers/${SERVER}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new GamePanelError("Панель не приняла ключ доступа");
  }
  if (response.status >= 500) {
    throw new GamePanelError(`Панель ответила ошибкой ${response.status}`);
  }
  return response;
}

export type ServerStatus = {
  state: string;
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number | null;
  diskMb: number;
  diskLimitMb: number | null;
  uptimeSec: number;
  name: string | null;
  address: string | null;
};

type ResourcesResponse = {
  // Calagopus отдаёт ресурсы плоско, Pterodactyl — внутри attributes.
  resources?: Record<string, number | object>;
  attributes?: { current_state?: string; resources?: Record<string, number> };
  current_state?: string;
};

function mb(bytes: unknown): number {
  return typeof bytes === "number" ? Math.round(bytes / 1_048_576) : 0;
}

/** Текущее состояние сервера: включён ли, сколько ест ресурсов. */
export async function serverStatus(): Promise<ServerStatus> {
  const response = await call("/resources");
  if (!response.ok) throw new GamePanelError(`Панель ответила ${response.status}`);
  const json = (await response.json()) as ResourcesResponse;

  const res = (json.attributes?.resources ?? json.resources ?? {}) as Record<string, number | string>;
  const state =
    json.attributes?.current_state ??
    json.current_state ??
    (typeof res.state === "string" ? res.state : null) ??
    "unknown";

  const details = await serverDetails();
  const cpu = typeof res.cpu_absolute === "number" ? res.cpu_absolute : 0;

  return {
    state,
    cpuPercent: Math.round(cpu * 10) / 10,
    memoryMb: mb(res.memory_bytes),
    memoryLimitMb: mb(res.memory_limit_bytes) || details.memoryLimitMb,
    diskMb: mb(res.disk_bytes),
    diskLimitMb: details.diskLimitMb,
    uptimeSec: typeof res.uptime === "number" ? Math.round(res.uptime / 1000) : 0,
    name: details.name,
    address: details.address,
  };
}

/** Имя, адрес и лимиты сервера — их /resources не отдаёт. */
async function serverDetails(): Promise<{
  name: string | null;
  address: string | null;
  memoryLimitMb: number | null;
  diskLimitMb: number | null;
}> {
  const empty = { name: null, address: null, memoryLimitMb: null, diskLimitMb: null };
  try {
    const response = await call("");
    if (!response.ok) return empty;
    const json = (await response.json()) as {
      server?: Record<string, unknown>;
      attributes?: Record<string, unknown>;
    };
    const server = (json.server ?? json.attributes ?? {}) as {
      name?: string;
      limits?: { memory?: number; disk?: number };
      allocation?: { ip_alias?: string; ip?: string; port?: number };
    };
    const allocation = server.allocation;
    const host = allocation?.ip_alias || allocation?.ip || null;

    return {
      name: typeof server.name === "string" ? server.name : null,
      address: host && allocation?.port ? `${host}:${allocation.port}` : null,
      memoryLimitMb: typeof server.limits?.memory === "number" ? server.limits.memory : null,
      diskLimitMb: typeof server.limits?.disk === "number" ? server.limits.disk : null,
    };
  } catch {
    return empty;
  }
}

export async function sendPower(signal: PowerSignal): Promise<void> {
  const response = await call("/power", { method: "POST", body: JSON.stringify({ signal }) });
  if (!response.ok && response.status !== 204) {
    throw new GamePanelError(`Панель не приняла команду (${response.status})`);
  }
}

/** Консольная команда сервера. Работает только когда сервер запущен. */
export async function sendCommand(command: string): Promise<void> {
  const response = await call("/command", { method: "POST", body: JSON.stringify({ command }) });
  if (response.status === 502) {
    throw new GamePanelError("Сервер выключен — консоль недоступна");
  }
  if (!response.ok && response.status !== 204) {
    throw new GamePanelError(`Панель не приняла команду (${response.status})`);
  }
}
