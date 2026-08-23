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
  // Прокручиваем страницу до конца: блоки с появлением по скроллу иначе
  // остаются прозрачными и на снимке выглядят как пустое место.
  await page.evaluate(async () => {
    const step = window.innerHeight / 2;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name, "→", page.url());
}

// регистрируем администратора (BOOTSTRAP_ADMIN_LOGIN=Steve) через API,
// чтобы скриншоты не зависели от таймингов формы
const registration = await page.request.post(BASE + "/api/auth/register", {
  data: { login: "Steve", email: "steve@example.com", password: "password123" },
});
console.log("register:", registration.status(), await registration.text());

// немного данных, чтобы страницы не выглядели пустыми
await page.request.post(BASE + "/api/mc/report", {
  headers: { "X-Server-Token": "testtoken" },
  data: { login: "Steve", text: "подозрительный полёт у спавна" },
});

await shot("/panel", "03-panel-login");

await page.fill('input[name="password"]', "password123");
await Promise.all([
  page.waitForURL("**/panel", { timeout: 20000 }),
  page.click("button.btn"),
]);
await page.screenshot({ path: `${OUT}/04-panel-dashboard.png`, fullPage: true });
console.log("04 dashboard →", page.url());

// новости публикуем через саму форму панели — заодно проверяем, что она работает
async function publish(title, summary, body, options = {}) {
  await page.goto(BASE + "/panel/news", { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="summary"]', summary);
  await page.fill('textarea[name="body"]', body);
  if (options.pinned) await page.check('input[name="pinned"]');
  if (options.broadcast) await page.check('input[name="broadcast"]');
  await page.click('form button.btn');
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    title,
    { timeout: 15000 },
  );
  console.log("опубликовано:", title);
}

await publish(
  "Сервер открыт",
  "Мир сгенерирован, спавн построен, деморган ждёт первых постояльцев.",
  "Мы открылись. Приватов не будет: порядок держат админы, откат гриферства и деморган.\n\nЗа мелкие нарушения — исправительные работы, а не бан. Время идёт 1 к 10 и только пока вы онлайн.",
  { pinned: true, broadcast: true },
);
await publish(
  "Кейсы и мини-игры",
  "Открыли раздел кейсов и две мини-игры на внутреннюю валюту.",
  "Шансы честные и совпадают с расчётом сервера. VanillaCoins не выводятся в деньги.",
);

await shot("/panel/users", "05-panel-users");
await shot("/panel/logs", "06-panel-logs");
await shot("/panel/promos", "07-panel-promos");
await shot("/panel/security", "08-panel-security");

await shot("/panel/news", "09-panel-news");
await shot("/news", "10-news");
await shot("/cases", "11-cases");
await shot("/games", "12-games");
await shot("/", "01-home");
await shot("/cabinet", "02-cabinet");

await browser.close();
