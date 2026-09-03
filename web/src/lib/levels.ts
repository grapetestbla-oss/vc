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

/**
 * Награда за достижение уровня. Пороговые уровни платят разово и заметно,
 * после тридцатого — ровная тысяча за каждый новый: дальше уровни даются
 * долго, и без этого прокачка после тридцати ничего не приносила бы.
 */
export function levelReward(level: number): number {
  if (level > 30) return 1000;
  switch (level) {
    case 5:
      return 500;
    case 10:
      return 1000;
    case 20:
      return 2000;
    case 30:
      return 5000;
    default:
      return 0;
  }
}

/** Ближайший уровень с наградой и её размер — для подсказки в кабинете. */
export function nextRewardedLevel(level: number): { level: number; vc: number } | null {
  for (let next = level + 1; next <= MAX_LEVEL; next += 1) {
    const vc = levelReward(next);
    if (vc > 0) return { level: next, vc };
  }
  return null;
}
