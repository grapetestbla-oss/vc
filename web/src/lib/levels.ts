/** Уровень аккаунта считается из наигранного времени: level = floor(sqrt(hours)). */
export const MAX_LEVEL = 50;

export function levelFromPlaytime(playtimeSec: number): number {
  const hours = playtimeSec / 3600;
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(hours)));
}

/** Сколько секунд нужно наиграть до следующего уровня. */
export function nextLevelAt(level: number): number {
  return Math.pow(level + 1, 2) * 3600;
}
