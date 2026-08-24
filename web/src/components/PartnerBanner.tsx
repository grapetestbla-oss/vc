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

/** Чистый кусочек той же таблички справа от текста: им и затираем. */
const CLEAN = { x: 1272, y: 353, width: 6, height: 74 };

/** Строка с наградой. На картинке она нарисована поверх неба. */
const REWARD_LINE = { x: 96, y: 220, width: 1184, height: 62 };

/** Что зашито в саму картинку — при совпадении её не трогаем. */
const BAKED = { reward: 1000, level: 3 };

const GOLD = "#ffd633";
const WHITE = "#ffffff";

type Segment = { text: string; color: string };

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  maxWidth: number,
  maxHeight: number,
): number {
  let size = maxHeight;
  for (; size > 8; size -= 1) {
    ctx.font = `700 ${size}px "Pixelify Sans", sans-serif`;
    const width = segments.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
    if (width <= maxWidth) break;
  }
  return size;
}

/** Рисует строку из разноцветных кусков по центру прямоугольника. */
function drawSegments(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  box: { x: number; y: number; width: number; height: number },
) {
  // Pixelify Sans рисует прописные примерно на 0,7 кегля, поэтому берём
  // высоту плашки целиком: иначе текст болтается в ней мелким.
  const size = fitFontSize(ctx, segments, box.width - 28, box.height);
  ctx.font = `700 ${size}px "Pixelify Sans", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  const total = segments.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
  let x = box.x + (box.width - total) / 2;
  const y = box.y + box.height / 2 + 1;

  for (const part of segments) {
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeStyle = "#120a04";
    ctx.strokeText(part.text, x, y);
    ctx.fillStyle = part.color;
    ctx.fillText(part.text, x, y);
    x += ctx.measureText(part.text).width;
  }
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
