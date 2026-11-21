import sharp from "sharp";

export const maximumLogoBytes = 5 * 1024 * 1024;
export const maximumLogoRequestBytes = maximumLogoBytes + 64 * 1024;

const maximumSourceEdge = 4096;
const maximumFramePixels = 4 * 1024 * 1024;
const maximumFrames = 128;
const maximumTotalDecodedPixels = 16 * 1024 * 1024;
const maximumOutputEdge = 512;
const maximumOutputBytes = 1024 * 1024;
const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegHeader = Buffer.from([0xff, 0xd8, 0xff]);

// Select a supported raster family before allowing native image metadata parsing.
function rasterFormat(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(pngHeader)) return "png";
  if (bytes.subarray(0, 3).equals(jpegHeader)) return "jpeg";
  const header = bytes.toString("latin1", 0, 6);
  if (header === "GIF87a" || header === "GIF89a") return "gif";
  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";
}

export async function readBoundedRequestBody(request: Pick<Request, "headers" | "body">, maximumBytes = maximumLogoRequestBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new TypeError("maximumBytes must be a non-negative safe integer");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(declaredLength)) {
      throw new Error("invalid content-length");
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > maximumBytes) {
      throw new Error("request body is too large");
    }
  }

  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("request body is too large");
        throw new Error("request body is too large");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function createSafeSiteLogo(source: Buffer | Uint8Array) {
  const bytes = Buffer.from(source);
  if (bytes.length === 0 || bytes.length > maximumLogoBytes) {
    throw new Error("invalid logo file size");
  }

  const format = rasterFormat(bytes);
  if (!format) throw new Error("unsupported logo format");
  const metadata = await readLogoMetadata(bytes);
  if (metadata.format !== format) {
    throw new Error("unsupported logo format");
  }
  const width = metadata.width ?? 0;
  const height = metadata.pageHeight ?? metadata.height ?? 0;
  const frames = metadata.pages ?? 1;
  if (!positiveInteger(width) || !positiveInteger(height) || !positiveInteger(frames)) {
    throw new Error("invalid logo dimensions");
  }
  if (width > maximumSourceEdge || height > maximumSourceEdge) {
    throw new Error("logo dimensions exceed the allowed edge");
  }
  if (frames > maximumFrames) {
    throw new Error("logo animation frame budget exceeded");
  }
  const framePixels = width * height;
  if (framePixels > maximumFramePixels || framePixels * frames > maximumTotalDecodedPixels) {
    throw new Error("logo pixel budget exceeded");
  }

  try {
    const result = await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: maximumFramePixels,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: maximumOutputEdge,
        height: maximumOutputEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 88, alphaQuality: 90, effort: 4, smartSubsample: true })
      .toBuffer();
    if (result.length === 0 || result.length > maximumOutputBytes) {
      throw new Error("sanitized logo exceeds the output budget");
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "sanitized logo exceeds the output budget") throw error;
    throw new Error("logo image could not be sanitized");
  }
}

async function readLogoMetadata(bytes: Buffer) {
  try {
    return await sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: maximumTotalDecodedPixels,
      sequentialRead: true,
    }).metadata();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (/pixel limit/i.test(detail)) throw new Error("logo pixel budget exceeded");
    throw new Error("invalid logo image");
  }
}

function positiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}
