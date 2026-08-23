import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE;
const exe = fs.readdirSync("/opt/pw-browsers").find((d) => d.startsWith("chromium-"));
const browser = await chromium.launch({
  executablePath: `/opt/pw-browsers/${exe}/chrome-linux/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto(BASE + "/", { waitUntil: "networkidle" });

const before = await page.evaluate(() => ({
  total: document.querySelectorAll(".reveal").length,
  visible: document.querySelectorAll(".reveal.is-visible").length,
}));

await page.evaluate(async () => {
  for (let step = 0; step < 40; step++) {
    window.scrollBy(0, window.innerHeight / 2);
    await new Promise((r) => setTimeout(r, 150));
    if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 2) break;
  }
  await new Promise((r) => setTimeout(r, 800));
});

const after = await page.evaluate(() => ({
  total: document.querySelectorAll(".reveal").length,
  visible: document.querySelectorAll(".reveal.is-visible").length,
}));

console.log("до скролла:", before, "после:", after);
console.log(after.visible === after.total ? "OK: все блоки проявились" : "ПРОБЛЕМА: часть блоков осталась скрытой");
await browser.close();
process.exit(after.visible === after.total ? 0 : 1);
