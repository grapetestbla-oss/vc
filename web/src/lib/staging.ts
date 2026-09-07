/**
 * Технический сайт (tech.vanillacraft.click).
 *
 * Тот же код и та же сборка, что на боевом, но своя база и закрытый вход:
 * обновления приезжают сюда раньше, и смотрит их только тот, кому положено.
 * Признак — переменная окружения, а не домен: домен подделывается заголовком
 * Host, переменная задаётся при запуске контейнера.
 */

export function isStaging(): boolean {
  return process.env.STAGING === "1";
}

/** Кому открыт технический сайт. По умолчанию — только главный администратор. */
export function stagingLogins(): string[] {
  return (process.env.STAGING_LOGINS ?? "rym6a")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);
}

export function stagingAllows(login: string | null | undefined): boolean {
  if (!isStaging()) return true;
  if (!login) return false;
  return stagingLogins().includes(login.toLowerCase());
}
