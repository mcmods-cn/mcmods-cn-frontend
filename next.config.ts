import type { NextConfig } from "next";
import { resolvePublicDeploymentConfig } from "./app/_lib/deployment-env.mts";

const isDevelopment = process.env.NODE_ENV !== "production";
const deploymentConfig = resolvePublicDeploymentConfig({
  apiBaseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  siteURL: process.env.NEXT_PUBLIC_SITE_URL,
  yggdrasilAPIRoot: process.env.NEXT_PUBLIC_YGGDRASIL_API_ROOT,
}, process.env.NODE_ENV);

const nextConfig: NextConfig = {
  output: "standalone",
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
    if (deploymentConfig.yggdrasilAPIRoot) {
      securityHeaders.push({
        key: "X-Authlib-Injector-API-Location",
        value: deploymentConfig.yggdrasilAPIRoot,
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
