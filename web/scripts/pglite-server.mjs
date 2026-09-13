import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// Каталог задают только локальному стенду: прогону проверок хранилище не нужно,
// он каждый раз начинает с чистой базы, а стенд между запусками должен помнить
// аккаунты и прогресс — иначе перед каждой съёмкой всё заводить заново.
const dataDir = process.env.PGLITE_DATA;
const db = await PGlite.create(dataDir ? { dataDir } : undefined);
const port = Number(process.env.PGLITE_PORT ?? 5432);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`PGlite listening on ${port}${dataDir ? ` (${dataDir})` : ""}`);
