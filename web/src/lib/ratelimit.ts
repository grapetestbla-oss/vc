type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Простой счётчик в памяти процесса. Для одного инстанса сайта этого хватает;
 * при масштабировании на несколько инстансов нужен Redis.
 */
export function rateLimit(key: string, limit: number, windowSec: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

// Раз в 10 минут выкидываем протухшие ключи, чтобы карта не росла бесконечно.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
}, 600_000).unref?.();
