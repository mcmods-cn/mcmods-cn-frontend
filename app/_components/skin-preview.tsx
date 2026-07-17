"use client";

import { useEffect, useRef, useState } from "react";
import { SkinModel } from "../_lib/skin-api";

export function SkinPreview2D({
  src,
  kind = "skin",
  model = "default",
  className = "",
  label = "",
}: {
  src: string;
  kind?: "skin" | "cape";
  model?: SkinModel;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      if (kind === "cape") drawCape(context, image);
      else drawSkin(context, image, model);
      setFailed(false);
    };
    image.onerror = () => { if (!cancelled) setFailed(true); };
    image.src = src;
    return () => { cancelled = true; image.src = ""; };
  }, [kind, model, src]);

  return (
    <div className={`relative grid place-items-center overflow-hidden bg-[linear-gradient(45deg,var(--panel-subtle)_25%,transparent_25%,transparent_75%,var(--panel-subtle)_75%),linear-gradient(45deg,var(--panel-subtle)_25%,transparent_25%,transparent_75%,var(--panel-subtle)_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] ${className}`}>
      <canvas
        ref={canvasRef}
        aria-label={label}
        className={`h-full max-h-full w-full max-w-full object-contain [image-rendering:pixelated] ${src && !failed ? "" : "invisible"}`}
        height={192}
        role="img"
        width={96}
      />
      {!src || failed ? (
        <span className="absolute grid h-28 w-16 place-items-center rounded-t-[45%] rounded-b-lg border-2 border-dashed border-[var(--line)] text-xs font-black text-[var(--muted)]">
          {kind === "cape" ? "CAPE" : "SKIN"}
        </span>
      ) : null}
    </div>
  );
}

function drawSkin(context: CanvasRenderingContext2D, image: HTMLImageElement, model: SkinModel) {
  const scale = 6;
  const armWidth = model === "slim" ? 3 : 4;
  const legacy = image.naturalHeight * 2 <= image.naturalWidth;
  const atlasScale = image.naturalWidth / 64;
  const draw = (source: Rect, target: Rect, flip = false) => drawPixelRegion(context, image, scaled(source, atlasScale), scaled(target, scale), flip);

  draw({ x: 8, y: 8, width: 8, height: 8 }, { x: 4, y: 0, width: 8, height: 8 });
  draw({ x: 20, y: 20, width: 8, height: 12 }, { x: 4, y: 8, width: 8, height: 12 });
  draw({ x: 44, y: 20, width: armWidth, height: 12 }, { x: 4 - armWidth, y: 8, width: armWidth, height: 12 });
  draw(
    legacy ? { x: 44, y: 20, width: armWidth, height: 12 } : { x: 36, y: 52, width: armWidth, height: 12 },
    { x: 12, y: 8, width: armWidth, height: 12 },
    legacy,
  );
  draw({ x: 4, y: 20, width: 4, height: 12 }, { x: 4, y: 20, width: 4, height: 12 });
  draw(
    legacy ? { x: 4, y: 20, width: 4, height: 12 } : { x: 20, y: 52, width: 4, height: 12 },
    { x: 8, y: 20, width: 4, height: 12 },
    legacy,
  );

  draw({ x: 40, y: 8, width: 8, height: 8 }, { x: 4, y: 0, width: 8, height: 8 });
  if (!legacy) {
    draw({ x: 20, y: 36, width: 8, height: 12 }, { x: 4, y: 8, width: 8, height: 12 });
    draw({ x: 44, y: 36, width: armWidth, height: 12 }, { x: 4 - armWidth, y: 8, width: armWidth, height: 12 });
    draw({ x: 52, y: 52, width: armWidth, height: 12 }, { x: 12, y: 8, width: armWidth, height: 12 });
    draw({ x: 4, y: 36, width: 4, height: 12 }, { x: 4, y: 20, width: 4, height: 12 });
    draw({ x: 4, y: 52, width: 4, height: 12 }, { x: 8, y: 20, width: 4, height: 12 });
  }
}

function drawCape(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const scale = Math.min(8, Math.floor(Math.min(context.canvas.width / 10, context.canvas.height / 16)));
  const width = 10 * scale;
  const height = 16 * scale;
  const x = Math.floor((context.canvas.width - width) / 2);
  const y = Math.floor((context.canvas.height - height) / 2);
  const baseWidth = image.naturalWidth % 64 === 0 && image.naturalHeight % 32 === 0 ? 64 : 22;
  const atlasScale = image.naturalWidth / baseWidth;
  context.drawImage(image, atlasScale, atlasScale, 10 * atlasScale, 16 * atlasScale, x, y, width, height);
}

function drawPixelRegion(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: Rect,
  target: Rect,
  flip: boolean,
) {
  if (!flip) {
    context.drawImage(image, source.x, source.y, source.width, source.height, target.x, target.y, target.width, target.height);
    return;
  }
  context.save();
  context.translate(target.x + target.width, target.y);
  context.scale(-1, 1);
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, target.width, target.height);
  context.restore();
}

function scaled(rect: Rect, scale: number): Rect {
  return { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
}

type Rect = { x: number; y: number; width: number; height: number };
