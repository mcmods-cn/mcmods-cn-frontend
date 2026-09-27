import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "./app/_lib/csp-policy.mts";

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
  return buildContentSecurityPolicy({
    nonce,
    production: !isDevelopment,
    apiBaseURL: configuredAPIBase,
    connectOrigins: process.env.NEXT_PUBLIC_CSP_CONNECT_ORIGINS,
    imageOrigins: process.env.NEXT_PUBLIC_CSP_IMAGE_ORIGINS,
    mediaOrigins: process.env.NEXT_PUBLIC_CSP_MEDIA_ORIGINS,
    fontOrigins: process.env.NEXT_PUBLIC_CSP_FONT_ORIGINS,
  });
}
