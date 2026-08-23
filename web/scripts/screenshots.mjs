import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE;
const OUT = process.env.OUT;
const exe = fs.readdirSync("/opt/pw-browsers").find((d) => d.startsWith("chromium-"));
const browser = await chromium.launch({
  executablePath: `/opt/pw-browsers/${exe}/chrome-linux/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

async function shot(path, name) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name, "→", page.url());
}

// регистрируем администратора (BOOTSTRAP_ADMIN_LOGIN=Steve) через API,
// чтобы скриншоты не зависели от таймингов формы
const registration = await page.request.post(BASE + "/api/auth/register", {
  data: { login: "Steve", email: "steve@example.com", password: "password123" },
});
console.log("register:", registration.status(), await registration.text());

// немного данных, чтобы панель не выглядела пустой
await page.request.post(BASE + "/api/mc/report", {
  headers: { "X-Server-Token": "testtoken" },
  data: { login: "Steve", text: "подозрительный полёт у спавна" },
});

await shot("/", "01-home");
await shot("/cabinet", "02-cabinet");
await shot("/panel", "03-panel-login");

await page.fill('input[name="password"]', "password123");
await Promise.all([
  page.waitForURL("**/panel", { timeout: 20000 }),
  page.click("button.btn"),
]);
await page.screenshot({ path: `${OUT}/04-panel-dashboard.png`, fullPage: true });
console.log("04 dashboard →", page.url());

await shot("/panel/users", "05-panel-users");
await shot("/panel/logs", "06-panel-logs");
await shot("/panel/promos", "07-panel-promos");
await shot("/panel/security", "08-panel-security");
await shot("/cases", "09-cases");

await browser.close();
