"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Готовый баннер партнёра: берём исходную картинку и подставляем в неё
 * настоящий промокод. Табличка на картинке нарисована художником, поэтому
 * старый текст мы не закрашиваем плашкой, а затираем куском её же фона —
 * так шов не виден.
 */
const BASE = { width: 1376, height: 768 };

/** Внутренность таблички «ПРОМОКОД» — сюда пишем свой текст. */
const PLAQUE = { x: 802, y: 353, width: 478, height: 74 };

/**
 * Чистый столбец той же таблички справа от текста: им и затираем.
 * Ширина ровно в один пиксель — иначе при растягивании появляются полосы.
 */
const CLEAN = { x: 1274, y: 353, width: 1, height: 74 };

/** Строка с наградой. На картинке она нарисована поверх неба. */
const REWARD_LINE = { x: 96, y: 220, width: 1184, height: 62 };

/** Что зашито в саму картинку — при совпадении её не трогаем. */
const BAKED = { reward: 1000, level: 3 };

/** Заливки букв: сверху светлее, снизу темнее — как на макете. */
const WHITE = { top: "#ffffff", bottom: "#cbd2e0" };
const GOLD = { top: "#ffec96", bottom: "#f0a414" };

type Segment = { text: string; top: string; bottom: string };

function font(size: number): string {
  return `400 ${size}px "Russo One", sans-serif`;
}

function scratch(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas.getContext("2d")!;
}

/**
 * Подбирает кегль: строка должна влезть в ширину плашки, а прописные — занять
 * заданную высоту. Дальше ограничения не идём: на макете буквы крупные, и
 * мелкий текст в широкой табличке выглядит потерянным.
 */
function fitFontSize(segments: Segment[], maxWidth: number, capHeight: number): number {
  const ctx = scratch(8, 8);
  let size = 8;
  for (let candidate = 8; candidate <= 200; candidate += 1) {
    ctx.font = font(candidate);
    const width = segments.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
    const caps = ctx.measureText("П").actualBoundingBoxAscent;
    if (width > maxWidth || caps > capHeight) break;
    size = candidate;
  }
  return size;
}

type Rendered = { canvas: HTMLCanvasElement; capTop: number; capHeight: number };

/**
 * Рисует строку на прозрачном слое. Каждый кусок заливается вертикальным
 * градиентом — на макете буквы светлее сверху и темнее снизу, плоская заливка
 * рядом с ними выглядит дёшево.
 */
function renderText(segments: Segment[], size: number): Rendered {
  const measure = scratch(8, 8);
  measure.font = font(size);
  const widths = segments.map((part) => measure.measureText(part.text).width);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const metrics = measure.measureText(segments.map((part) => part.text).join(""));
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
  const descent = Math.ceil(Math.max(0, metrics.actualBoundingBoxDescent));
  const pad = 4;

  const ctx = scratch(total + pad * 2, ascent + descent + pad * 2);
  ctx.font = font(size);
  ctx.textBaseline = "alphabetic";

  const top = pad;
  const bottom = pad + ascent;
  let x = pad;
  segments.forEach((part, index) => {
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, part.top);
    gradient.addColorStop(1, part.bottom);
    ctx.fillStyle = gradient;
    ctx.fillText(part.text, x, pad + ascent);
    x += widths[index];
  });

  return { canvas: ctx.canvas, capTop: pad, capHeight: ascent };
}

/** Копия строки, залитая одним цветом — из неё собираем обводку и «объём». */
function tint(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const ctx = scratch(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, source.width, source.height);
  return ctx.canvas;
}

/**
 * Собирает надпись как на макете: чёрный контур по кругу, тёмная копия со
 * сдвигом вниз-вправо вместо объёма и сам текст сверху.
 */
function withOutline(text: HTMLCanvasElement, radius: number, depth: number): HTMLCanvasElement {
  const black = tint(text, "#100903");
  const shade = tint(text, "#4a2c0c");
  const margin = radius + depth;

  const out = scratch(text.width + margin * 2, text.height + margin * 2);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      out.drawImage(black, margin + dx, margin + dy);
    }
  }
  if (depth > 0) out.drawImage(shade, margin + depth, margin + depth);
  out.drawImage(text, margin, margin);
  return out.canvas;
}

/** Ставит готовую строку по центру прямоугольника — уже без масштабирования. */
function drawSegments(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  box: { x: number; y: number; width: number; height: number },
) {
  const size = fitFontSize(segments, box.width - 32, box.height * 0.68);
  const text = renderText(segments, size);
  const radius = Math.max(3, Math.round(size / 11));
  const depth = Math.max(2, Math.round(size / 14));
  const outlined = withOutline(text.canvas, radius, depth);

  // Центрируем по прописным, а не по всей картинке: иначе строка с «хвостами»
  // (буква «У» в «УРОВНЯ») уезжает вверх относительно строки без них.
  const capCenter = text.capTop + text.capHeight / 2 + radius + depth;
  const x = Math.round(box.x + (box.width - outlined.width) / 2);
  const y = Math.round(box.y + box.height / 2 - capCenter);
  ctx.drawImage(outlined, x, y);
}

/** Тёмная плашка в стиле баннера — под строку с наградой, если её надо переписать. */
function drawBand(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
) {
  const radius = 14;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, radius);
  ctx.fillStyle = "rgba(24,14,6,0.9)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f0b830";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#120a04";
  ctx.stroke();
  ctx.restore();
}

export default function PartnerBanner({
  code,
  rewardVc,
  requiredLevel,
}: {
  code: string;
  rewardVc: number;
  requiredLevel: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const base = new Image();
    base.src = "/partners/banner-base.jpg";
    try {
      await base.decode();
      // Без явной загрузки шрифта первый кадр уходит системным начертанием.
      await document.fonts.load('400 48px "Russo One"', "ПРОМОКОД 0123");
      await document.fonts.ready;
    } catch {
      setError("Не удалось загрузить картинку баннера");
      return;
    }

    canvas.width = BASE.width;
    canvas.height = BASE.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, BASE.width, BASE.height);

    // Затираем старый текст таблички, растянув чистый кусок её фона.
    ctx.drawImage(
      base,
      CLEAN.x,
      CLEAN.y,
      CLEAN.width,
      CLEAN.height,
      PLAQUE.x,
      PLAQUE.y,
      PLAQUE.width,
      PLAQUE.height,
    );
    drawSegments(
      ctx,
      [
        { text: "ПРОМОКОД: ", ...WHITE },
        { text: code, ...GOLD },
      ],
      PLAQUE,
    );

    // Строку с наградой переписываем, только если она разошлась с картинкой.
    if (rewardVc !== BAKED.reward || requiredLevel !== BAKED.level) {
      drawBand(ctx, REWARD_LINE);
      drawSegments(
        ctx,
        [
          { text: "ПОЛУЧИ ", ...WHITE },
          { text: `${rewardVc} VC`, ...GOLD },
          { text: " ПРИ ДОСТИЖЕНИИ ", ...WHITE },
          { text: String(requiredLevel), ...GOLD },
          { text: " УРОВНЯ!", ...WHITE },
        ],
        REWARD_LINE,
      );
    }

    setReady(true);
  }, [code, rewardVc, requiredLevel]);

  useEffect(() => {
    draw();
  }, [draw]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vanillacraft-${code.toLowerCase()}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
        <canvas ref={canvasRef} className="block h-auto w-full" />
      </div>

      <div className="space-y-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
        <button className="btn w-full sm:w-auto" onClick={download} disabled={!ready}>
          {ready ? "Скачать баннер" : "Готовим баннер…"}
        </button>
        <span className="muted block text-sm">
          PNG 1376×768 — годится для шапки канала, поста и превью.
        </span>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
