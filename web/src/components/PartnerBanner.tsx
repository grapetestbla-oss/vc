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

const GOLD = "#ffd633";
const WHITE = "#ffffff";

type Segment = { text: string; color: string };

function font(size: number): string {
  return `700 ${size}px "Pixelify Sans", sans-serif`;
}

function scratch(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas.getContext("2d")!;
}

/**
 * Подбирает кегль: строка должна влезть в ширину плашки, а прописные — занять
 * заданную долю её высоты. Размер округляем до чётного — пиксельный шрифт на
 * дробных размерах плывёт, буквы получаются разной толщины.
 */
function fitFontSize(segments: Segment[], maxWidth: number, capHeight: number): number {
  const ctx = scratch(8, 8);
  let size = 8;
  for (let candidate = 8; candidate <= 200; candidate += 2) {
    ctx.font = font(candidate);
    const width = segments.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
    const metrics = ctx.measureText("П");
    if (width > maxWidth || metrics.actualBoundingBoxAscent > capHeight) break;
    size = candidate;
  }
  return size;
}

/**
 * Рисует строку на прозрачном слое и убирает сглаживание: полупрозрачные
 * пиксели по краям либо становятся сплошными, либо исчезают. Без этого
 * пиксельный шрифт выглядит замыленным, особенно под обводкой.
 */
function renderMask(segments: Segment[], size: number): HTMLCanvasElement {
  const measure = scratch(8, 8);
  measure.font = font(size);
  const widths = segments.map((part) => measure.measureText(part.text).width);
  const total = widths.reduce((sum, width) => sum + width, 0);
  // Метрики берём у самой строки, а не у образцовых букв: иначе пустое место
  // под несуществующие «хвосты» уводит текст вверх от центра плашки.
  const metrics = measure.measureText(segments.map((part) => part.text).join(""));
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
  const descent = Math.ceil(Math.max(0, metrics.actualBoundingBoxDescent));
  const pad = 2;

  const ctx = scratch(total + pad * 2, ascent + descent + pad * 2);
  ctx.font = font(size);
  ctx.textBaseline = "alphabetic";
  let x = pad;
  segments.forEach((part, index) => {
    ctx.fillStyle = part.color;
    ctx.fillText(part.text, x, pad + ascent);
    x += widths[index];
  });

  const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const data = image.data;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] >= 128 ? 255 : 0;
  }
  ctx.putImageData(image, 0, 0);
  return ctx.canvas;
}

/** Обводка: та же маска, залитая чёрным и размноженная по кругу под текстом. */
function withOutline(mask: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const shadow = scratch(mask.width, mask.height);
  shadow.drawImage(mask, 0, 0);
  shadow.globalCompositeOperation = "source-in";
  shadow.fillStyle = "#120a04";
  shadow.fillRect(0, 0, mask.width, mask.height);

  const out = scratch(mask.width + radius * 2, mask.height + radius * 2);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      out.drawImage(shadow.canvas, radius + dx, radius + dy);
    }
  }
  out.drawImage(mask, radius, radius);
  return out.canvas;
}

/** Ставит готовую строку по центру прямоугольника — уже без масштабирования. */
function drawSegments(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  box: { x: number; y: number; width: number; height: number },
) {
  const size = fitFontSize(segments, box.width - 40, box.height * 0.66);
  const mask = renderMask(segments, size);
  const outlined = withOutline(mask, Math.max(2, Math.round(size / 14)));

  // Кладём в целые пиксели: половинка пикселя снова включила бы сглаживание.
  const x = Math.round(box.x + (box.width - outlined.width) / 2);
  const y = Math.round(box.y + (box.height - outlined.height) / 2);
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
      await document.fonts.load('700 48px "Pixelify Sans"', "ПРОМОКОД 0123");
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
        { text: "ПРОМОКОД: ", color: WHITE },
        { text: code, color: GOLD },
      ],
      PLAQUE,
    );

    // Строку с наградой переписываем, только если она разошлась с картинкой.
    if (rewardVc !== BAKED.reward || requiredLevel !== BAKED.level) {
      drawBand(ctx, REWARD_LINE);
      drawSegments(
        ctx,
        [
          { text: "ПОЛУЧИ ", color: WHITE },
          { text: `${rewardVc} VC`, color: GOLD },
          { text: " ПРИ ДОСТИЖЕНИИ ", color: WHITE },
          { text: String(requiredLevel), color: GOLD },
          { text: " УРОВНЯ!", color: WHITE },
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
