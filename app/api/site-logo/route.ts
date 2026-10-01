import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const maximumLogoBytes = 5 * 1024 * 1024;
const apiBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function POST(request: NextRequest) {
  if (!await canWriteSiteSettings(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > maximumLogoBytes) {
    return NextResponse.json({ error: "invalid logo file" }, { status: 422 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = rasterExtension(bytes);
  if (!extension) {
    return NextResponse.json({ error: "logo must be PNG, JPEG, WebP, or GIF" }, { status: 422 });
  }
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const fileName = `site-logo-${digest}.${extension}`;
  const directory = path.join(process.cwd(), "public", "site-assets");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return NextResponse.json({ url: `/site-assets/${fileName}` }, { status: 201 });
}

async function canWriteSiteSettings(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const headers = new Headers();
  if (/^Bearer [^.\s]+\.[^.\s]+\.[^.\s]+$/i.test(authorization)) {
    headers.set("Authorization", authorization);
  } else {
    const session = request.cookies.get("mcmods_session");
    // This local route mutates disk, so cookie authentication also requires an
    // exact same-origin request before the backend permission lookup.
    if (!session?.value || request.headers.get("origin") !== request.nextUrl.origin) return false;
    headers.set("Cookie", `mcmods_session=${session.value}`);
  }
  try {
    const response = await fetch(`${apiBaseURL}/api/v1/admin/config/general/logo-upload-access`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function rasterExtension(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return "";
}
