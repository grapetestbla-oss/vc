import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Provably fair: результат = HMAC(serverSeed, `${clientSeed}:${nonce}`).
 * Хэш серверного сида публикуется заранее, сам сид раскрывается при ротации,
 * так что игрок может пересчитать любую свою игру.
 */
export function newServerSeed(): { serverSeed: string; serverSeedHash: string } {
  const serverSeed = randomBytes(32).toString("hex");
  return { serverSeed, serverSeedHash: sha256(serverSeed) };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function roll(serverSeed: string, clientSeed: string, nonce: number): number {
  const digest = createHmac("sha512", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  // Первые 13 hex-символов дают равномерное число в [0, 1).
  return parseInt(digest.slice(0, 13), 16) / Math.pow(2, 52);
}

/** Точка краха при заданном RTP. Классическая формула с домом на 1/houseEdge. */
export function crashPoint(random: number, rtp: number): number {
  if (random < 1 - rtp) return 1.0; // мгновенный крах — преимущество заведения
  const raw = 1 / (1 - random);
  return Math.max(1.0, Math.floor(raw * 100) / 100);
}

/** Выпал ли выигрыш при ставке на множитель. Шанс = rtp / multiplier. */
export function rouletteWin(random: number, multiplier: number, rtp: number): boolean {
  return random < rtp / multiplier;
}
