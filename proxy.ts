import { NextRequest, NextResponse } from "next/server";

const configuredAPIBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const isDevelopment = process.env.NODE_ENV !== "production";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

function contentSecurityPolicy(nonce: string) {
  const connectSources = ["'self'", "https:"];
  const imageSources = ["'self'", "data:", "blob:", "https:"];
  const apiOrigin = safeOrigin(configuredAPIBase);
  if (apiOrigin) {
    connectSources.push(apiOrigin);
    imageSources.push(apiOrigin);
  }
  if (isDevelopment) {
    connectSources.push("http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*");
    imageSources.push("http://localhost:*", "http://127.0.0.1:*");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data: https:",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src https://embed.diagrams.net https://www.geogebra.org https://player.bilibili.com https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function safeOrigin(value?: string) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}
