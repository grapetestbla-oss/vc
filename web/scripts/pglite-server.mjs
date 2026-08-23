import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5432, host: "127.0.0.1" });
await server.start();
console.log("PGlite listening on 5432");
