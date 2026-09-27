import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  createSafeSiteLogo,
  maximumLogoBytes,
  readBoundedRequestBody,
} from "../../_lib/site-logo-image.mts";

export const runtime = "nodejs";

const apiBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function POST(request: NextRequest) {
  if (!await canWriteSiteSettings(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    return NextResponse.json({ error: "multipart form data is required" }, { status: 415 });
  }
  const body = await readBoundedRequestBody(request).catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "logo request body is too large or invalid" }, { status: 413 });
  }
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const form = await boundedRequest.formData().catch(() => null);
  const files = form?.getAll("file") ?? [];
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File) || file.size <= 0 || file.size > maximumLogoBytes) {
    return NextResponse.json({ error: "invalid logo file" }, { status: 422 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeLogo = await createSafeSiteLogo(bytes).catch(() => null);
  if (!safeLogo) {
    return NextResponse.json({ error: "logo must be a safe PNG, JPEG, WebP, or GIF image" }, { status: 422 });
  }
  const digest = createHash("sha256").update(safeLogo).digest("hex").slice(0, 20);
  const fileName = `site-logo-${digest}.webp`;
  const directory = path.join(process.cwd(), "public", "site-assets");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), safeLogo, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return NextResponse.json({ url: `/site-assets/${fileName}` }, { status: 201 });
}

async function canWriteSiteSettings(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  try {
    const response = await fetch(`${apiBaseURL}/api/v1/admin/config/general/logo-upload-access`, {
      cache: "no-store",
      headers: { Authorization: authorization },
    });
    return response.ok;
  } catch {
    return false;
  }
}
