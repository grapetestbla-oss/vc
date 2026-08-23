/** Цвета редкостей — одни и те же на всех страницах. */
export const RARITY = {
  common: { label: "Обычный", color: "#9aa3b2" },
  rare: { label: "Редкий", color: "#5ea9ff" },
  epic: { label: "Эпический", color: "#c77dff" },
  legendary: { label: "Легендарный", color: "#f5c451" },
} as const;

export type Rarity = keyof typeof RARITY;

export function rarityColor(rarity: string): string {
  return RARITY[rarity as Rarity]?.color ?? RARITY.common.color;
}

export function rarityLabel(rarity: string): string {
  return RARITY[rarity as Rarity]?.label ?? RARITY.common.label;
}

export const KIND_LABEL: Record<string, string> = {
  TRAIL: "Шлейф",
  AURA: "Аура",
  PET: "Питомец",
  HAT: "Шляпа",
  JOIN_EFFECT: "Эффект входа",
  NAME_COLOR: "Цвет ника",
  TITLE: "Титул",
  WORLD_MARK: "Метка в мире",
};
