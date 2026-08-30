/**
 * Разбор слепка инвентаря от плагина и приведение его к виду, удобному панели.
 *
 * Плагин присылает уже разобранный список предметов: Base64 из Bukkit читается
 * только самим Bukkit, поэтому сайту он бесполезен.
 */

export type InventoryItem = {
  area: "main" | "armor" | "offhand" | "ender";
  slot: number;
  label?: string;
  type: string;
  amount: number;
  name?: string;
  damage?: number;
  maxDamage?: number;
  enchants?: string[];
};

export type Snapshot = {
  login: string;
  items: InventoryItem[];
  world: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  health: number | null;
  food: number | null;
  xpLevel: number | null;
  gameMode: string | null;
};

const AREAS = new Set(["main", "armor", "offhand", "ender"]);
/** Верхняя граница на всякий случай: 36 + 4 + 1 + 27 = 68 слотов, с запасом. */
const MAX_ITEMS = 120;

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function parseItem(raw: unknown): InventoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const area = typeof item.area === "string" && AREAS.has(item.area) ? item.area : null;
  const type = text(item.type, 64);
  const slot = int(item.slot);
  const amount = int(item.amount);
  if (!area || !type || slot === null || slot < 0 || amount === null || amount <= 0) return null;

  const enchants = Array.isArray(item.enchants)
    ? item.enchants
        .map((entry) => text(entry, 48))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 12)
    : undefined;

  return {
    area: area as InventoryItem["area"],
    slot,
    label: text(item.label, 24),
    type,
    amount,
    name: text(item.name, 96),
    damage: int(item.damage) ?? undefined,
    maxDamage: int(item.maxDamage) ?? undefined,
    enchants: enchants && enchants.length ? enchants : undefined,
  };
}

export function parseSnapshot(body: unknown): Snapshot | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  const login = text(raw.login, 32);
  if (!login || !Array.isArray(raw.items)) return null;

  const items = raw.items
    .map(parseItem)
    .filter((item): item is InventoryItem => item !== null)
    .slice(0, MAX_ITEMS);

  return {
    login,
    items,
    world: text(raw.world, 64) ?? null,
    x: int(raw.x),
    y: int(raw.y),
    z: int(raw.z),
    health: int(raw.health),
    food: int(raw.food),
    xpLevel: int(raw.xpLevel),
    gameMode: text(raw.gameMode, 16) ?? null,
  };
}

/** `diamond_sword` → `Diamond Sword`: русских названий предметов у нас нет. */
export function itemTitle(type: string): string {
  return type
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Слепок из базы: `items` в Prisma — Json, поэтому проверяем его тем же разбором. */
export function itemsOf(value: unknown): InventoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseItem).filter((item): item is InventoryItem => item !== null);
}
