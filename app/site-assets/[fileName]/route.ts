import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const logoNamePattern = /^site-logo-[a-f0-9]{20}\.webp$/;

export async function GET(_request: NextRequest, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  if (!logoNamePattern.test(fileName)) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "site-assets", fileName));
    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
