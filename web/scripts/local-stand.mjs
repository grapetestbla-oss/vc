/**
 * Локальный стенд: сайт рядом с игровым сервером, без Docker и без Postgres.
 *
 *   node scripts/local-stand.mjs
 *   node scripts/local-stand.mjs --port 3000 --lan
 *
 * Нужен, когда мир крутится на своей машине: плагин за каждым числом ходит на
 * сайт, и без сайта рядом в игре мертвы и кейсы, и задания ивента. Держать
 * ради этого боевой адрес нельзя — тестовые покупки ушли бы в общую базу.
 *
 * База — PGlite в файлах: это тот же Postgres, только встроенный, и ставить
 * на машину с игровым сервером ничего не нужно. Каталог хранения переживает
 * перезапуск, иначе перед каждой съёмкой аккаунт и прогресс заводились бы
 * заново.
 *
 * Слушаем по умолчанию только сам компьютер. Вход на сайт идёт по паролю от
 * игрового аккаунта и без TLS — пускать такое в сеть можно только осознанно,
 * поэтому для соседних машин есть отдельный ключ --lan.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const STAND = path.join(ROOT, ".local-stand");
const WINDOWS = process.platform === "win32";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : fallback;
};

const PORT = Number(flag("port", 3000));
const PG_PORT = Number(flag("pg-port", 5433));
const HOST = args.includes("--lan") ? "0.0.0.0" : "127.0.0.1";
const REBUILD = args.includes("--rebuild");
const RESET_DB = args.includes("--reset-db");

fs.mkdirSync(STAND, { recursive: true });

// Каталог базы, оставшийся от убитого процесса, больше не открывается — и
// молча: PGlite просто не доходит до готовности. Лечится только удалением,
// поэтому даём ключ, а не отправляем искать папку руками.
if (RESET_DB) {
  fs.rmSync(path.join(STAND, "pgdata"), { recursive: true, force: true });
  console.log("→ База сброшена: аккаунты и прогресс заведутся заново");
}

/**
 * Токен для плагина храним между запусками: он прописан в config.yml на той же
 * машине, и новый на каждый запуск означал бы правку конфига каждый раз.
 */
const tokenFile = path.join(STAND, "server-token.txt");
if (!fs.existsSync(tokenFile)) {
  fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString("hex"));
}
const TOKEN = fs.readFileSync(tokenFile, "utf8").trim();

const children = [];

function start(command, commandArgs, options = {}) {
  // На Windows npx и npm — это .cmd, и без оболочки spawn их не находит.
  const child = spawn(command, commandArgs, {
    cwd: ROOT,
    shell: WINDOWS,
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...options.env },
  });
  children.push(child);
  return child;
}

function done(child, what) {
  return new Promise((resolve, reject) => {
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${what}: код ${code}\n${output}`)),
    );
  });
}

/**
 * Ждём строку от самой базы, а не открытый порт. PGlite держит ровно одно
 * соединение, и пробный сокет занимает этот единственный слот: порт уже
 * открыт, а первый настоящий запрос упирается в «Can't reach database server».
 */
function waitLine(child, needle, seconds) {
  return new Promise((resolve) => {
    let seen = "";
    const timer = setTimeout(() => resolve(false), seconds * 1000);
    const watch = (chunk) => {
      seen += chunk;
      if (seen.includes(needle)) {
        clearTimeout(timer);
        resolve(true);
      }
    };
    child.stdout?.on("data", watch);
    child.stderr?.on("data", watch);
  });
}

/** Дожидаемся, пока порт начнёт отвечать: «уже слушает» надёжнее, чем пауза. */
async function waitPort(port, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = net.connect({ port, host: "127.0.0.1" }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(800, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (open) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

const DATABASE_URL =
  `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres` +
  `?connection_limit=1&pool_timeout=30&pgbouncer=true`;

/**
 * Кассы, Telegram и панель хостинга выключены пустыми значениями: стенд не
 * должен принимать настоящие платежи, писать в общий чат и трогать игровой
 * сервер на VPS. Ночной перезапуск по той же причине работать не будет — он
 * просит перезапуск через панель.
 */
const SITE_ENV = {
  DATABASE_URL,
  MC_SERVER_TOKEN: TOKEN,
  SITE_URL: `http://127.0.0.1:${PORT}`,
  PORT: String(PORT),
  HOSTNAME: HOST,
  NODE_ENV: "production",
  BOOTSTRAP_ADMIN_LOGIN: flag("admin", ""),
  FREEKASSA_MERCHANT_ID: "",
  PLATEGA_MERCHANT_ID: "",
  GAME_PANEL_URL: "",
  GAME_PANEL_KEY: "",
  GAME_PANEL_SERVER_ID: "",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_WEBHOOK_SECRET: "",
  DEPLOY_AGENT_TOKEN: "",
};

async function main() {
  console.log("→ База");
  const pg = start("node", ["scripts/pglite-server.mjs"], {
    quiet: true,
    env: { PGLITE_PORT: String(PG_PORT), PGLITE_DATA: path.join(STAND, "pgdata") },
  });
  pg.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`База остановилась (код ${code}). Занят порт ${PG_PORT}?`);
      shutdown(1);
    }
  });
  if (!(await waitLine(pg, "listening", 180))) {
    throw new Error(
      "база не поднялась за три минуты. Обычно это каталог, оставшийся от " +
        "прерванного запуска: перезапустите с --reset-db, база заведётся заново.",
    );
  }

  console.log("→ Схема и каталог");
  await done(
    start("npx", ["prisma", "db", "push", "--skip-generate"], { quiet: true, env: { DATABASE_URL } }),
    "prisma db push",
  );
  await done(
    start("node", ["prisma/seed.mjs"], { quiet: true, env: { DATABASE_URL } }),
    "каталог",
  );

  const server = path.join(ROOT, ".next", "standalone", "server.js");
  if (REBUILD || !fs.existsSync(server)) {
    console.log("→ Сборка сайта (несколько минут, только в первый раз)");
    await done(start("npm", ["run", "build"], { quiet: true, env: { DATABASE_URL } }), "сборка");
  }

  // Сборка standalone кладёт рядом только код: статику и public надо принести
  // руками, иначе сайт откроется без стилей и без артов кейсов.
  const standalone = path.join(ROOT, ".next", "standalone");
  fs.cpSync(path.join(ROOT, ".next", "static"), path.join(standalone, ".next", "static"), {
    recursive: true,
  });
  fs.rmSync(path.join(standalone, "public"), { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "public"), path.join(standalone, "public"), { recursive: true });

  console.log("→ Сайт");
  // Именно server.js, а не next start: сайт собирается в режиме standalone, и
  // next start с ним не работает — Next об этом честно предупреждает сам.
  const site = start("node", [server], { env: SITE_ENV });

  // Занятый порт ловим по самому сайту, а не опросом порта: на занятом порту
  // кто-то уже отвечает, и опрос радостно сообщил бы, что всё поднялось.
  const ready = await Promise.race([
    waitPort(PORT, 120).then((ok) => (ok ? "ok" : "timeout")),
    new Promise((resolve) => site.on("exit", () => resolve("exit"))),
  ]);
  if (ready !== "ok") {
    throw new Error(
      ready === "exit"
        ? "сайт не запустился. Чаще всего порт " + PORT + " уже занят — попробуйте --port " + (PORT + 1) + "."
        : "сайт не поднялся",
    );
  }

  const reachable = HOST === "0.0.0.0" ? lanAddress() : "127.0.0.1";
  console.log(`
Стенд поднят: http://${reachable}:${PORT}

  В config.yml плагина (plugins/VanillaCore/config.yml):
    api:
      url: "http://${reachable}:${PORT}"
      token: "${TOKEN}"
      site-url: "http://${reachable}:${PORT}"

  Дальше: зарегистрируйтесь на сайте тем же ником, что и в игре.${
    SITE_ENV.BOOTSTRAP_ADMIN_LOGIN
      ? ""
      : "\n  Чтобы попасть в панель, перезапустите с --admin <ваш-ник>."
  }
  Ивент включается в панели: Осенний ивент → Запустить, начало сдвиньте на
  4-5 дней назад — тогда открыты задания 1, 3 и 5 дня.

  Ctrl+C останавливает стенд. База лежит в .local-stand и переживает перезапуск.
${
  HOST === "0.0.0.0"
    ? "\n  Стенд слушает всю сеть, а вход идёт по паролю и без шифрования.\n  Наружу его выставлять нельзя.\n"
    : ""
}`);
}

function shutdown(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((error) => {
  console.error(String(error.message ?? error));
  shutdown(1);
});
