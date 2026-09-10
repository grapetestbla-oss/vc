/**
 * Пересборка таблицы метрик шрифта промокода.
 *
 *   pip install fonttools && node scripts/font-metrics.mjs
 *
 * Разбор TTF отдан fontTools через python3: он нужен ровно один раз при смене
 * шрифта, и тащить ради этого зависимость в сборку сайта незачем.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const FONT = "public/partners/Oswald-Bold.ttf";
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

const python = `
from fontTools.ttLib import TTFont
import json
f = TTFont(${JSON.stringify(FONT)})
cmap = f.getBestCmap(); hmtx = f['hmtx']; glyf = f['glyf']
out = {}
for ch in ${JSON.stringify(CHARS)}:
    gn = cmap[ord(ch)]
    adv, lsb = hmtx[gn]
    g = glyf[gn]
    ink = (g.xMax - g.xMin) if g.numberOfContours else adv
    out[ch] = [adv, lsb, ink]
print(json.dumps({
    "upm": f['head'].unitsPerEm,
    "cap": f['OS/2'].sCapHeight,
    "metrics": out,
}))
`;

const data = JSON.parse(execFileSync("python3", ["-c", python], { encoding: "utf8" }));
const rows = Object.entries(data.metrics)
  .map(([ch, m]) => `  ${/^[A-Z0-9]$/.test(ch) ? ch : JSON.stringify(ch)}: [${m.join(", ")}],`)
  .join("\n");

writeFileSync(
  "src/lib/oswald-metrics.ts",
  `/**
 * Метрики Oswald Bold для символов, из которых состоят промокоды: продвижение
 * пера, левый вынос и ширина краски в единицах шрифта.
 *
 * Таблица лежит в коде, а не читается из файла шрифта на лету: разбирать TTF в
 * рантайме ради семи букв незачем, а промокоды состоят только из этих символов
 * (проверка в панели: [A-Z0-9_]{3,16}).
 *
 * Пересобрать после смены шрифта: node scripts/font-metrics.mjs
 */
export const OSWALD_UPM = ${data.upm};
export const OSWALD_CAP_HEIGHT = ${data.cap};

export const OSWALD_METRICS: Record<string, [number, number, number]> = {
${rows}
};
`,
);
console.log("метрики пересобраны:", Object.keys(data.metrics).length, "символов");
