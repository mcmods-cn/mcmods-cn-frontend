import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const logoNamePattern = /^site-logo-[a-f0-9]{20}\.(png|jpe?g|webp|gif)$/;

export async function GET(_request: NextRequest, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  const match = logoNamePattern.exec(fileName);
  if (!match) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "site-assets", fileName));
    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType(match[1]),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

function contentType(extension: string) {
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "image/gif";
}
