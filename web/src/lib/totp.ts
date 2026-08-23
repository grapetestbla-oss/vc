import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) для входа в админ-панель. Реализован на стандартной
 * криптографии: внешняя библиотека ради тридцати строк тут ни к чему.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function generateSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let secret = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function codeAt(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(value % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Проверка с окном ±1 шаг — часы на телефоне и сервере расходятся. */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== DIGITS) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let shift = -window; shift <= window; shift++) {
    const expected = Buffer.from(codeAt(secret, counter + shift));
    const actual = Buffer.from(normalized);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  return false;
}

/** Ссылка для Google Authenticator, Aegis и подобных. */
export function otpauthUrl(login: string, secret: string, issuer = "VanillaCoins"): string {
  const label = encodeURIComponent(`${issuer}:${login}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
