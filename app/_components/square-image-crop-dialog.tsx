"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";

export type SquareCropOutput = {
  files: Map<number, File>;
  previewUrl: string;
};

type Crop = { x: number; y: number; size: number };
type ImageSize = { width: number; height: number };

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 420;
const CANVAS_PADDING = 22;

export function SquareImageCropDialog({
  file,
  minimumSize,
  outputSizes,
  onCancel,
  onConfirm,
}: {
  file?: File;
  minimumSize: number;
  outputSizes: number[];
  onCancel: () => void;
  onConfirm: (output: SquareCropOutput) => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | undefined>(undefined);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | undefined>(undefined);
  const [imageSize, setImageSize] = useState<ImageSize>();
  const [crop, setCrop] = useState<Crop>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const objectUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => {
    if (!file || !objectUrl) return;
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      if (image.naturalWidth < minimumSize || image.naturalHeight < minimumSize) {
        setError(t("resourceEditor.cropTooSmall", { size: minimumSize }));
        return;
      }
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      imageRef.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setCrop({
        x: (image.naturalWidth - size) / 2,
        y: (image.naturalHeight - size) / 2,
        size,
      });
      setError("");
    };
    image.onerror = () => {
      if (!cancelled) setError(t("resourceEditor.cropInvalid"));
    };
    image.src = objectUrl;
    return () => {
      cancelled = true;
      imageRef.current = undefined;
    };
  }, [file, minimumSize, objectUrl, t]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageSize || !crop) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const transform = imageTransform(imageSize);
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, transform.x, transform.y, transform.width, transform.height);
    context.fillStyle = "rgba(9, 14, 12, 0.58)";
    context.fillRect(transform.x, transform.y, transform.width, transform.height);
    const cropRect = imageCropToCanvas(crop, transform);
    context.save();
    context.beginPath();
    context.rect(cropRect.x, cropRect.y, cropRect.size, cropRect.size);
    context.clip();
    context.drawImage(image, transform.x, transform.y, transform.width, transform.height);
    context.restore();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.strokeRect(cropRect.x, cropRect.y, cropRect.size, cropRect.size);
  }, [crop, imageSize]);

  if (!file) return null;

  async function confirm() {
    const image = imageRef.current;
    if (!image || !crop || busy) return;
    setBusy(true);
    setError("");
    try {
      const files = new Map<number, File>();
      const orderedSizes = [...new Set(outputSizes)].sort((left, right) => left - right);
      for (const size of orderedSizes) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("canvas unavailable");
        context.clearRect(0, 0, size, size);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size);
        const blob = await canvasBlob(canvas);
        files.set(size, new File([blob], `resource-${size}x${size}.png`, { type: "image/png" }));
      }
      const previewFile = files.get(Math.max(...orderedSizes));
      if (!previewFile) throw new Error("preview unavailable");
      onConfirm({ files, previewUrl: URL.createObjectURL(previewFile) });
    } catch {
      setError(t("resourceEditor.cropFailed"));
    } finally {
      setBusy(false);
    }
  }

  function moveCrop(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !imageSize || !crop) return;
    const point = eventCanvasPoint(event, event.currentTarget);
    const transform = imageTransform(imageSize);
    const imageX = (point.x - transform.x) / transform.scale;
    const imageY = (point.y - transform.y) / transform.scale;
    setCrop({
      ...crop,
      x: clamp(imageX - drag.offsetX, 0, imageSize.width - crop.size),
      y: clamp(imageY - drag.offsetY, 0, imageSize.height - crop.size),
    });
  }

  return <div aria-modal="true" className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4" role="dialog">
    <section className="w-full max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">{t("resourceEditor.cropTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("resourceEditor.cropDescription")}</p>
        </div>
        <button aria-label={t("common.close")} className="button-secondary focus-ring" disabled={busy} type="button" onClick={onCancel}>×</button>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-[linear-gradient(45deg,#d7dbd8_25%,transparent_25%),linear-gradient(-45deg,#d7dbd8_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d7dbd8_75%),linear-gradient(-45deg,transparent_75%,#d7dbd8_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
        <canvas
          className="block h-auto w-full touch-none cursor-move"
          height={CANVAS_HEIGHT}
          ref={canvasRef}
          width={CANVAS_WIDTH}
          onPointerCancel={() => { dragRef.current = undefined; }}
          onPointerDown={(event) => {
            if (!crop || !imageSize) return;
            const point = eventCanvasPoint(event, event.currentTarget);
            const transform = imageTransform(imageSize);
            const imageX = (point.x - transform.x) / transform.scale;
            const imageY = (point.y - transform.y) / transform.scale;
            if (imageX < crop.x || imageX > crop.x + crop.size || imageY < crop.y || imageY > crop.y + crop.size) return;
            dragRef.current = { pointerId: event.pointerId, offsetX: imageX - crop.x, offsetY: imageY - crop.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={moveCrop}
          onPointerUp={(event) => {
            dragRef.current = undefined;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">{t("resourceEditor.cropHint", { size: minimumSize })}</p>
      {error ? <p className="mt-3 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-3">
        <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={onCancel}>{t("common.cancel")}</button>
        <button className="button-primary focus-ring" disabled={busy || Boolean(error) || !crop} type="button" onClick={() => void confirm()}>
          {busy ? t("resourceEditor.processing") : t("resourceEditor.cropConfirm")}
        </button>
      </div>
    </section>
  </div>;
}

function imageTransform(image: ImageSize) {
  const scale = Math.min(
    (CANVAS_WIDTH - CANVAS_PADDING * 2) / image.width,
    (CANVAS_HEIGHT - CANVAS_PADDING * 2) / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    scale,
    width,
    height,
    x: (CANVAS_WIDTH - width) / 2,
    y: (CANVAS_HEIGHT - height) / 2,
  };
}

function imageCropToCanvas(crop: Crop, transform: ReturnType<typeof imageTransform>) {
  return {
    x: transform.x + crop.x * transform.scale,
    y: transform.y + crop.y * transform.scale,
    size: crop.size * transform.scale,
  };
}

function eventCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
  };
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png");
  });
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
