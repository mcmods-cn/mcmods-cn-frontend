import type { NextConfig } from "next";

const configuredYggdrasilAPIRoot = process.env.NEXT_PUBLIC_YGGDRASIL_API_ROOT?.trim();
const isDevelopment = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    ];
    if (!isDevelopment) {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    if (configuredYggdrasilAPIRoot) {
      securityHeaders.push({
        key: "X-Authlib-Injector-API-Location",
        value: ensureTrailingSlash(configuredYggdrasilAPIRoot),
      });
    }
    return [{
      source: "/:path*",
      headers: securityHeaders,
    }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "oss.mcmods.cn" },
    ],
  },
};

export default nextConfig;

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
