import type { NextConfig } from "next";

const configuredYggdrasilAPIRoot = process.env.NEXT_PUBLIC_YGGDRASIL_API_ROOT?.trim();

const nextConfig: NextConfig = {
  async headers() {
    if (!configuredYggdrasilAPIRoot) return [];
    const yggdrasilAPIRoot = ensureTrailingSlash(configuredYggdrasilAPIRoot);
    return [{
      source: "/:path*",
      headers: [{ key: "X-Authlib-Injector-API-Location", value: yggdrasilAPIRoot }],
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
