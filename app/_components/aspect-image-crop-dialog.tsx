"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";

export type CropOutputSpec = { key: string; width: number; height: number; type?: "image/png" | "image/webp"; quality?: number };
export type AspectCropOutput = { files: Map<string, File>; previewUrl: string };

type Crop = { x: number; y: number; width: number; height: number };
type ImageSize = { width: number; height: number };

const canvasWidth = 760;
const canvasHeight = 480;
const canvasPadding = 24;

export function AspectImageCropDialog({ file, aspectWidth, aspectHeight, minimumWidth = 1, minimumHeight = 1, outputs, onCancel, onConfirm }: {
  file?: File;
  aspectWidth: number;
  aspectHeight: number;
  minimumWidth?: number;
  minimumHeight?: number;
  outputs: CropOutputSpec[];
  onCancel: () => void;
  onConfirm: (output: AspectCropOutput) => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | undefined>(undefined);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | undefined>(undefined);
  const [imageSize, setImageSize] = useState<ImageSize>();
  const [crop, setCrop] = useState<Crop>();
  const [loadedObjectUrl, setLoadedObjectUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const objectUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  useEffect(() => {
    if (!file || !objectUrl) return;
    let cancelled = false;
    imageRef.current = undefined;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      if (image.naturalWidth < minimumWidth || image.naturalHeight < minimumHeight) {
        setError(t("resourceEditor.cropTooSmall", { size: `${minimumWidth} × ${minimumHeight}` }));
        return;
      }
      const next = maximumAspectCrop(image.naturalWidth, image.naturalHeight, aspectWidth, aspectHeight);
      imageRef.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setCrop(next);
      setLoadedObjectUrl(objectUrl);
      setError("");
    };
    image.onerror = () => { if (!cancelled) setError(t("resourceEditor.cropInvalid")); };
    image.src = objectUrl;
    return () => { cancelled = true; imageRef.current = undefined; };
  }, [aspectHeight, aspectWidth, file, minimumHeight, minimumWidth, objectUrl, t]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageSize || !crop) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const transform = imageTransform(imageSize);
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, transform.x, transform.y, transform.width, transform.height);
    context.fillStyle = "rgba(9, 14, 12, 0.62)";
    context.fillRect(transform.x, transform.y, transform.width, transform.height);
    const visible = cropToCanvas(crop, transform);
    context.save();
    context.beginPath();
    context.rect(visible.x, visible.y, visible.width, visible.height);
    context.clip();
    context.drawImage(image, transform.x, transform.y, transform.width, transform.height);
    context.restore();
    context.strokeStyle = "#fff";
    context.lineWidth = 3;
    context.strokeRect(visible.x, visible.y, visible.width, visible.height);
    drawThirds(context, visible);
  }, [crop, imageSize]);

  if (!file) return null;

  async function confirm() {
    const image = imageRef.current;
    if (!image || !crop || loadedObjectUrl !== objectUrl || busy) return;
    setBusy(true);
    setError("");
    try {
      const files = new Map<string, File>();
      for (const output of outputs) {
        const canvas = document.createElement("canvas");
        canvas.width = output.width;
        canvas.height = output.height;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("Canvas unavailable");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
        const type = output.type ?? "image/png";
        const blob = await canvasBlob(canvas, type, output.quality);
        const extension = type === "image/webp" ? "webp" : "png";
        files.set(output.key, new File([blob], `crop-${output.width}x${output.height}.${extension}`, { type }));
      }
      const preview = files.values().next().value as File | undefined;
      if (!preview) throw new Error("Preview unavailable");
      onConfirm({ files, previewUrl: URL.createObjectURL(preview) });
    } catch {
      setError(t("resourceEditor.cropFailed"));
    } finally {
      setBusy(false);
    }
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !imageSize || !crop) return;
    const point = eventCanvasPoint(event, event.currentTarget);
    const transform = imageTransform(imageSize);
    const imageX = (point.x - transform.x) / transform.scale;
    const imageY = (point.y - transform.y) / transform.scale;
    setCrop({ ...crop, x: clamp(imageX - drag.offsetX, 0, imageSize.width - crop.width), y: clamp(imageY - drag.offsetY, 0, imageSize.height - crop.height) });
  }

  function resizeCrop(scalePercent: number) {
    if (!imageSize || !crop) return;
    const maximum = maximumAspectCrop(imageSize.width, imageSize.height, aspectWidth, aspectHeight);
    const minimumCropWidth = Math.min(maximum.width, Math.max(minimumWidth, minimumHeight * aspectWidth / aspectHeight));
    const targetWidth = clamp(maximum.width * scalePercent / 100, minimumCropWidth, maximum.width);
    setCrop(resizeAspectCropAroundCenter(crop, targetWidth, imageSize, aspectWidth / aspectHeight));
  }

  const maximumCrop = imageSize ? maximumAspectCrop(imageSize.width, imageSize.height, aspectWidth, aspectHeight) : undefined;
  const minimumCropWidth = maximumCrop ? Math.min(maximumCrop.width, Math.max(minimumWidth, minimumHeight * aspectWidth / aspectHeight)) : 0;
  const minimumScale = maximumCrop ? Math.ceil(minimumCropWidth / maximumCrop.width * 100) : 100;
  const cropScale = crop && maximumCrop ? Math.round(crop.width / maximumCrop.width * 100) : 100;

  return <div aria-modal="true" className="fixed inset-0 z-[130] grid place-items-center bg-black/65 p-3 sm:p-5" role="dialog">
    <section className="surface flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--line)] shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-4 sm:p-5">
        <div><h2 className="text-xl font-black">{t("resourceEditor.cropTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{aspectWidth} : {aspectHeight} · {t("resourceEditor.cropDescription")}</p></div>
        <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={onCancel}>{t("common.close")}</button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
        <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[linear-gradient(45deg,#d7dbd8_25%,transparent_25%),linear-gradient(-45deg,#d7dbd8_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d7dbd8_75%),linear-gradient(-45deg,transparent_75%,#d7dbd8_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
          <canvas className="block h-auto w-full cursor-move touch-none" height={canvasHeight} ref={canvasRef} width={canvasWidth}
            onPointerCancel={() => { dragRef.current = undefined; }} onPointerMove={move}
            onPointerDown={(event) => {
              if (!crop || !imageSize) return;
              const point = eventCanvasPoint(event, event.currentTarget);
              const transform = imageTransform(imageSize);
              const x = (point.x - transform.x) / transform.scale;
              const y = (point.y - transform.y) / transform.scale;
              if (x < crop.x || x > crop.x + crop.width || y < crop.y || y > crop.y + crop.height) return;
              dragRef.current = { pointerId: event.pointerId, offsetX: x - crop.x, offsetY: y - crop.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => { dragRef.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">{t("resourceEditor.cropHint", { size: `${minimumWidth} × ${minimumHeight}` })}</p>
        <label className="mt-4 grid gap-2 text-sm font-bold">
          <span className="flex items-center justify-between gap-3"><span>{t("resourceEditor.cropScale")}</span><output>{cropScale}%</output></span>
          <input className="w-full accent-[var(--accent)]" disabled={!crop || Boolean(error)} max={100} min={minimumScale} step={1} type="range" value={cropScale} onChange={(event) => resizeCrop(Number(event.target.value))} />
        </label>
        {error ? <p className="mt-3 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{error}</p> : null}
      </div>
      <footer className="flex justify-end gap-3 border-t border-[var(--line)] p-4 sm:p-5"><button className="button-secondary focus-ring" disabled={busy} type="button" onClick={onCancel}>{t("common.cancel")}</button><button className="button-primary focus-ring" disabled={busy || Boolean(error) || !crop || loadedObjectUrl !== objectUrl} type="button" onClick={() => void confirm()}>{busy ? t("resourceEditor.processing") : t("resourceEditor.cropConfirm")}</button></footer>
    </section>
  </div>;
}

function maximumAspectCrop(width: number, height: number, aspectWidth: number, aspectHeight: number): Crop {
  const ratio = aspectWidth / aspectHeight;
  const cropWidth = width / height > ratio ? height * ratio : width;
  const cropHeight = cropWidth / ratio;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

function imageTransform(image: ImageSize) {
  const scale = Math.min((canvasWidth - canvasPadding * 2) / image.width, (canvasHeight - canvasPadding * 2) / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { scale, width, height, x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2 };
}

function cropToCanvas(crop: Crop, transform: ReturnType<typeof imageTransform>) {
  return { x: transform.x + crop.x * transform.scale, y: transform.y + crop.y * transform.scale, width: crop.width * transform.scale, height: crop.height * transform.scale };
}

function drawThirds(context: CanvasRenderingContext2D, crop: ReturnType<typeof cropToCanvas>) {
  context.save();
  context.strokeStyle = "rgba(255,255,255,.5)";
  context.lineWidth = 1;
  for (let index = 1; index <= 2; index += 1) {
    const x = crop.x + crop.width * index / 3;
    const y = crop.y + crop.height * index / 3;
    context.beginPath(); context.moveTo(x, crop.y); context.lineTo(x, crop.y + crop.height); context.stroke();
    context.beginPath(); context.moveTo(crop.x, y); context.lineTo(crop.x + crop.width, y); context.stroke();
  }
  context.restore();
}

function resizeAspectCropAroundCenter(crop: Crop, width: number, image: ImageSize, ratio: number): Crop {
  const height = width / ratio;
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  return {
    x: clamp(centerX - width / 2, 0, image.width - width),
    y: clamp(centerY - height / 2, 0, image.height - height),
    width,
    height,
  };
}

function eventCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const bounds = canvas.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed")), type, quality));
}

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
