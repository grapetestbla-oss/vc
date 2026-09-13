/**
 * Собирает ролик-обзор обновления из текста и графики.
 *
 *   node scripts/update-video.mjs [куда.mp4]
 *
 * Это заготовка под монтаж, а не готовый ролик: карточки с текстом, арты
 * кейсов и логотип. Игровые кадры вставляются поверх потом — их всё равно
 * снимают руками, а титры каждый раз перерисовывать незачем.
 *
 * Каждая сцена рендерится отдельным файлом и склеивается встык: xfade на
 * девяти сценах — это один фильтр на весь ролик и полчаса ожидания, а
 * затемнение по краям сцены даёт тот же эффект перехода за секунды.
 *
 * Текст рисует сам ffmpeg через drawtext: заголовки — Oswald из репозитория
 * (он же на баннерах партнёров), строки помельче — системный DejaVu, если он
 * есть. Верстать текст картинкой пришлось бы через шрифты в SVG, а это ещё
 * одна зависимость ради того же результата.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const ROOT = path.join(import.meta.dirname, "..");
const OUT = process.argv[2] ?? path.join(ROOT, "update-autumn.mp4");
const WORK = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "vc-video-"));

const W = 1920;
const H = 1080;
const FPS = 30;

const HEAD_FONT = path.join(ROOT, "public", "partners", "Oswald-Bold.ttf");
const BODY_FONT = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((file) =>
  fs.existsSync(file),
) ?? HEAD_FONT;

const GOLD = "0xE8C87A";
const MINT = "0x7FE3C0";
const WHITE = "0xF2F3F5";
const MUTED = "0x9AA0AA";

/** Сцены ролика. Порядок — порядок показа. */
const SCENES = [
  {
    eyebrow: "vanillacraft.click",
    title: "ОСЕННЕЕ ОБНОВЛЕНИЕ",
    lines: ["Ивент на две недели, кейсы прямо в игре,", "античит и порядок в мелочах"],
    logo: true,
    seconds: 5,
  },
  {
    eyebrow: "Событие сезона",
    title: "ОСЕННИЙ ИВЕНТ",
    lines: [
      "14 дней, 7 больших заданий",
      "Новое задание открывается через день",
      "Сдал — 12 часов кулдауна, потом новый круг",
      "За каждый круг — кейс",
    ],
    seconds: 6,
  },
  {
    eyebrow: "/event",
    title: "ЗАДАНИЯ",
    lines: [
      "Сбор урожая · Погреб на зиму · Листопад",
      "Ночная охота · Тыквенные фонари",
      "Глубокая осень · Пир урожая",
      "Прогресс считает сайт — выход из игры его не сбросит",
    ],
    seconds: 6,
  },
  {
    eyebrow: "/cases",
    title: "КЕЙСЫ ПРЯМО В ИГРЕ",
    lines: [
      "Витрина и прокрутка в одном окне",
      "Приз решает сайт до анимации — честно",
      "Оплаченные кейсы ждут отдельной строкой",
    ],
    cases: true,
    seconds: 6,
  },
  {
    eyebrow: "Экономика",
    title: "ОСКОЛКИ УБРАНЫ",
    lines: [
      "Все призы и цены — в VC",
      "Осколки переведены по курсу 3 к 1",
      "Дубли из кейсов возвращаются деньгами",
    ],
    seconds: 5,
  },
  {
    eyebrow: "Честная игра",
    title: "АНТИЧИТ И ЛОВУШКИ",
    lines: [
      "Ловушечная руда без единого подхода — её видит только X-Ray",
      "Сторонний античит подключён мостом",
      "Сработки летят админам в Telegram",
      "Банов автоматом нет: смотрит человек",
    ],
    seconds: 6,
  },
  {
    eyebrow: "Наказания",
    title: "ДЕМОРГАН ПЕРЕСТРОЕН",
    lines: [
      "Настоящий забой вместо ямы",
      "Наряд у прораба сокращает срок",
      "Инвентарь и точка входа возвращаются после выпуска",
    ],
    seconds: 5,
  },
  {
    eyebrow: "Администрация",
    title: "ТИХИЙ ВХОД",
    lines: [
      "/chide прячет и из мира, и из списка игроков",
      "Админ заходит невидимым, без сообщения в чат",
      "Онлайн на сайте и в списке серверов не врёт",
    ],
    seconds: 5,
  },
  {
    eyebrow: "Каждую ночь",
    title: "ПЕРЕЗАПУСК В 00:00",
    lines: ["Предупреждение за 10 минут", "Отсчёт в чате и на экране", "Сервер поднимает панель сама"],
    seconds: 5,
  },
  {
    eyebrow: "Заходи",
    title: "VANILLACRAFT",
    lines: ["vanillacraft.dreamkit.pro", "vanillacraft.click", "t.me/vanillacraftx"],
    logo: true,
    seconds: 6,
  },
];

/** Экранирование для drawtext: двоеточие и апостроф ломают разбор фильтра. */
function esc(text) {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
}

function drawtext(options) {
  const parts = [
    `fontfile=${options.font}`,
    `text='${esc(options.text)}'`,
    `fontcolor=${options.color}`,
    `fontsize=${options.size}`,
    `x=${options.x}`,
    `y=${options.y}`,
  ];
  if (options.alpha) parts.push(`alpha='${options.alpha}'`);
  return `drawtext=${parts.join(":")}`;
}

/**
 * Текст сцены появляется не разом, а строка за строкой: так глаз успевает
 * прочитать верхнюю, пока проявляется следующая.
 */
function sceneFilters(scene) {
  const left = 260;
  const filters = [];

  filters.push(
    drawtext({
      font: BODY_FONT,
      text: scene.eyebrow.toUpperCase(),
      color: MINT,
      size: 30,
      x: left,
      y: 430,
      alpha: "min(1,max(0,(t-0.15)/0.35))",
    }),
  );

  filters.push(
    drawtext({
      font: HEAD_FONT,
      text: scene.title,
      color: GOLD,
      size: 108,
      x: left,
      y: 480,
      alpha: "min(1,max(0,(t-0.3)/0.4))",
    }),
  );

  scene.lines.forEach((line, index) => {
    const start = 0.75 + index * 0.28;
    filters.push(
      drawtext({
        font: BODY_FONT,
        text: line,
        color: index === 0 ? WHITE : MUTED,
        size: 38,
        x: left,
        y: 670 + index * 62,
        alpha: `min(1,max(0,(t-${start.toFixed(2)})/0.35))`,
      }),
    );
  });

  return filters;
}

/** Подложка: тёмный градиент и мягкое золотое свечение сбоку — как на сайте. */
function background(seconds) {
  return [
    `-f`, `lavfi`,
    `-i`, `gradients=s=${W}x${H}:c0=0x07080b:c1=0x11131a:x0=0:y0=0:x1=${W}:y1=${H}:d=${seconds}:r=${FPS}`,
    `-f`, `lavfi`,
    `-i`, `color=c=0xE8C87A:s=${W}x${H}:d=${seconds}:r=${FPS}`,
  ];
}

async function renderScene(scene, index) {
  const file = path.join(WORK, `scene-${String(index).padStart(2, "0")}.mp4`);
  const seconds = scene.seconds;
  const inputs = background(seconds);
  const extra = [];

  // Свечение — золотое пятно с мягким краем, как подсветка на сайте. Считаем
  // его прозрачностью, а не маской слияния: маска красит весь кадр, и фон
  // уходит в золото вместо тёмного.
  const chain = [
    `[1:v]format=rgba,geq=r=232:g=200:b=122:` +
      `a='54*exp(-((X-1560)*(X-1560)+(Y-200)*(Y-200))/170000)'[glow]`,
    `[0:v][glow]overlay=0:0,noise=alls=5,format=yuv420p[bg]`,
  ];

  let last = "bg";
  let nextInput = 2;

  if (scene.logo) {
    inputs.push("-i", path.join(ROOT, "public", "logo.png"));
    extra.push(`[${nextInput}:v]scale=150:-1[logo]`);
    extra.push(`[${last}][logo]overlay=x=260:y=150:format=auto[withlogo]`);
    last = "withlogo";
    nextInput += 1;
  }

  if (scene.cases) {
    // Арты лентой вдоль низа, а не колонкой справа: справа стоит заголовок, и
    // в колонке он налезал бы на картинки.
    const arts = ["wild", "zoo", "legends", "daily"];
    arts.forEach((art) => inputs.push("-i", path.join(ROOT, "public", "cases", `${art}.png`)));
    arts.forEach((_, i) => {
      extra.push(`[${nextInput + i}:v]scale=340:-1[art${i}]`);
    });
    arts.forEach((_, i) => {
      const from = i === 0 ? last : `cases${i - 1}`;
      const to = i === arts.length - 1 ? "cases" : `cases${i}`;
      // Появляются по очереди, как карточки на витрине сайта.
      extra.push(
        `[${from}][art${i}]overlay=x=${240 + i * 360}:y=832:` +
          `enable='gte(t,${(1.4 + i * 0.25).toFixed(2)})'[${to}]`,
      );
    });
    last = "cases";
    nextInput += arts.length;
  }

  const filters = [
    ...chain,
    ...extra,
    `[${last}]` +
      sceneFilters(scene).join(",") +
      `,fade=t=in:st=0:d=0.35,fade=t=out:st=${(seconds - 0.4).toFixed(2)}:d=0.4[out]`,
  ].join(";");

  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", filters,
    "-map", "[out]",
    "-t", String(seconds),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    file,
  ]);

  console.log(`  сцена ${index + 1}/${SCENES.length}: ${scene.title}`);
  return file;
}

async function main() {
  console.log(`Шрифт заголовков: ${path.basename(HEAD_FONT)}, текста: ${path.basename(BODY_FONT)}`);

  const files = [];
  for (const [index, scene] of SCENES.entries()) {
    files.push(await renderScene(scene, index));
  }

  const list = path.join(WORK, "list.txt");
  fs.writeFileSync(list, files.map((file) => `file '${file}'`).join("\n"));

  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", list,
    "-c", "copy",
    OUT,
  ]);

  const seconds = SCENES.reduce((sum, scene) => sum + scene.seconds, 0);
  console.log(`Готово: ${OUT} — ${seconds} с, ${W}x${H}`);
}

main()
  .catch((error) => {
    console.error(error.stderr ?? error);
    process.exit(1);
  })
  .finally(() => fs.rmSync(WORK, { recursive: true, force: true }));
