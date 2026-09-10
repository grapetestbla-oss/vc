import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { OSWALD_CAP_HEIGHT, OSWALD_METRICS, OSWALD_UPM } from "./oswald-metrics";

const run = promisify(execFile);

/**
 * Видеобаннер медиапартнёра.
 *
 * Берём готовый ролик, стираем в нём наш собственный промокод и вписываем код
 * партнёра тем же шрифтом на то же место. Перерисовывать ролик целиком не нужно
 * — меняется одна надпись.
 *
 * Считает сервер, а не браузер: собрать mp4 на клиенте можно только через
 * MediaRecorder, а он в каждом браузере даёт свой кодек и своё качество, и
 * партнёр получал бы то webm, то дёрганый h264.
 */

/** Промокоды состоят только из этих символов — так проверяет панель. */
const CODE_PATTERN = /^[A-Z0-9_]{3,16}$/;

/**
 * Геометрия исходного ролика 1920×586. Числа сняты с кадров: коробка промокода,
 * строка надписи в ней и моменты её появления.
 */
const LAYOUT = {
  /** Центр коробки по горизонтали. */
  centerX: 1219.5,
  /** Сколько места под надпись внутри коробки. */
  maxWidth: 367,
  /** Верх заглавных букв и их высота в исходнике. */
  capTop: 235,
  capHeight: 65,
  /** Межбуквенный просвет долей кегля: без него шрифт стоит плотнее исходника. */
  tracking: 0.065,
  /** Коробка вырастает с 2.05 до 2.16 секунды. */
  growFrom: 2.05,
  grownAt: 2.16,
  /** За столько секунд код проявляется вместе с коробкой. */
  fade: 0.14,
};

export class VideoBannerError extends Error {}

type Glyph = { char: string; x: number };

/**
 * Раскладка надписи: где стоит каждая буква и какого она кегля.
 *
 * Буквы ставим по отдельности, потому что ffmpeg не умеет межбуквенный
 * интервал, а без него надпись выходит теснее исходной. Позиция считается по
 * продвижению пера: сдвиг на левый вынос ffmpeg добавляет сам.
 */
function layout(code: string): { glyphs: Glyph[]; size: number; y: number } {
  const measure = (size: number) => {
    const k = size / OSWALD_UPM;
    const glyphs: Glyph[] = [];
    let pen = 0;
    for (const char of code) {
      const [advance] = OSWALD_METRICS[char];
      glyphs.push({ char, x: pen });
      pen += advance * k + LAYOUT.tracking * size;
    }
    const first = OSWALD_METRICS[code[0]];
    const last = OSWALD_METRICS[code[code.length - 1]];
    // Ширина по краске: выносы по краям в неё не входят, иначе надпись встала бы
    // не по центру коробки.
    const width = pen - LAYOUT.tracking * size - first[1] * k - (last[0] - last[1] - last[2]) * k;
    return { glyphs, width, k };
  };

  let size = Math.round((LAYOUT.capHeight / OSWALD_CAP_HEIGHT) * OSWALD_UPM);
  let box = measure(size);
  if (box.width > LAYOUT.maxWidth) {
    // Длинный код ужимаем, но строку держим на месте: он должен читаться
    // ровно там же, где короткий.
    size = Math.floor(size * (LAYOUT.maxWidth / box.width));
    box = measure(size);
  }

  const originX = LAYOUT.centerX - box.width / 2 - OSWALD_METRICS[code[0]][1] * box.k;
  // При y=0 ffmpeg ставит верх заглавных в ноль, поэтому y — это верх букв.
  const y = LAYOUT.capTop + LAYOUT.capHeight / 2 - (size * OSWALD_CAP_HEIGHT) / OSWALD_UPM / 2;

  return {
    glyphs: box.glyphs.map((glyph) => ({ ...glyph, x: originX + glyph.x })),
    size,
    y,
  };
}

function filterChain(code: string, fontPath: string): string {
  const { glyphs, size, y } = layout(code);

  const wipe = [
    // Первые кадры коробка заметно меньше, и точечная затирка мимо неё не
    // попадает. Эти кадры гасим целиком: сотая доля секунды, зато наш код не
    // мелькнёт у партнёра даже одним кадром.
    `delogo=x=960:y=205:w=480:h=136:enable='between(t,${LAYOUT.growFrom},${LAYOUT.grownAt})'`,
    // Дальше коробка на месте — стираем только её нутро. delogo достраивает
    // фон по краям кадр за кадром, поэтому переливы и блик остаются живыми.
    `delogo=x=1020:y=222:w=392:h=104:enable='gte(t,${LAYOUT.grownAt})'`,
  ];

  const alpha = `min(1,max(0,(t-${LAYOUT.grownAt})/${LAYOUT.fade}))`;
  const text = glyphs.map(
    (glyph) =>
      `drawtext=fontfile=${fontPath}:text='${glyph.char}':fontcolor=0x121212:` +
      `fontsize=${size}:x=${glyph.x.toFixed(1)}:y=${y.toFixed(1)}:` +
      `alpha='${alpha}':enable='gte(t,${LAYOUT.grownAt})'`,
  );

  return [...wipe, ...text].join(",");
}

function paths() {
  const root = process.cwd();
  return {
    base: path.join(root, "public", "partners", "banner-base.mp4"),
    font: path.join(root, "public", "partners", "Oswald-Bold.ttf"),
    cache: process.env.BANNER_CACHE_DIR ?? "/tmp/vc-banners",
  };
}

/** Сколько готовых роликов держим на диске. Каждый — около четырёх мегабайт. */
function cacheLimit(): number {
  const value = Number.parseInt(process.env.BANNER_CACHE_FILES ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 40;
}

/**
 * Вычищает лишнее из кэша, начиная с самых старых. Место на VPS считанное, а
 * каждый партнёр оставляет после себя файл.
 */
async function trimCache(dir: string) {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const limit = cacheLimit();
  if (names.length <= limit) return;

  const files = await Promise.all(
    names.map(async (name) => {
      const file = path.join(dir, name);
      try {
        return { file, time: (await stat(file)).mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const sorted = files.filter((item) => item !== null).sort((left, right) => left.time - right.time);
  for (const item of sorted.slice(0, sorted.length - limit)) {
    await rm(item.file, { force: true });
  }
}

/**
 * Отдаёт путь к ролику с кодом партнёра, собирая его при первом обращении.
 * Готовый файл остаётся на диске: пересобирать одно и то же на каждое нажатие
 * незачем, а сборка занимает секунды процессорного времени.
 */
export async function renderVideoBanner(rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    throw new VideoBannerError("В промокоде есть символы, которых нет в шрифте баннера");
  }

  const { base, font, cache } = paths();
  await mkdir(cache, { recursive: true });

  // Имя по коду и по содержимому исходника: сменили ролик — старые файлы
  // перестают подходить сами, чистить кэш руками не нужно.
  const stamp = createHash("sha1")
    .update(`${code}:${(await stat(base)).size}:${(await stat(base)).mtimeMs}`)
    .digest("hex")
    .slice(0, 12);
  const target = path.join(cache, `${code}-${stamp}.mp4`);

  try {
    await stat(target);
    return target;
  } catch {
    // Ролика ещё нет — собираем.
  }

  const partial = `${target}.tmp.mp4`;
  try {
    await run(
      "ffmpeg",
      [
        "-y", "-v", "error",
        "-i", base,
        "-vf", filterChain(code, font),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        partial,
      ],
      { timeout: 120_000, maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    await rm(partial, { force: true });
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("ENOENT")) {
      throw new VideoBannerError("На сервере нет ffmpeg — видеобаннер собрать нечем");
    }
    throw new VideoBannerError("Не удалось собрать ролик");
  }

  // Переименование в готовое имя делаем последним шагом: два одновременных
  // запроса иначе отдали бы недописанный файл.
  const { rename } = await import("node:fs/promises");
  await rename(partial, target);
  await trimCache(cache);
  return target;
}

export function videoBannerName(code: string): string {
  return `vanillacraft-${code.toLowerCase()}.mp4`;
}
