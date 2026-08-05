"use client";

import { AspectImageCropDialog } from "./aspect-image-crop-dialog";

export type SquareCropOutput = { files: Map<number, File>; previewUrl: string };

export function SquareImageCropDialog({ file, minimumSize, outputSizes, onCancel, onConfirm }: {
  file?: File;
  minimumSize: number;
  outputSizes: number[];
  onCancel: () => void;
  onConfirm: (output: SquareCropOutput) => void;
}) {
  return <AspectImageCropDialog
    aspectHeight={1}
    aspectWidth={1}
    file={file}
    minimumHeight={minimumSize}
    minimumWidth={minimumSize}
    outputs={[...new Set(outputSizes)].map((size) => ({ key: String(size), width: size, height: size, type: "image/png" as const }))}
    onCancel={onCancel}
    onConfirm={(output) => onConfirm({ previewUrl: output.previewUrl, files: new Map([...output.files].map(([key, value]) => [Number(key), value])) })}
  />;
}
