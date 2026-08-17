import type { MetadataRoute } from "next";

const siteURL = (process.env.NEXT_PUBLIC_SITE_URL || "https://mcmods.cn").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "", "/mods", "/modpacks", "/plugins", "/maps", "/servers", "/addons",
    "/resource-packs", "/shaders", "/datapacks", "/news", "/tutorials",
    "/issues", "/discussions", "/blueprints", "/skins", "/authors", "/tools",
    "/site-affairs/about", "/site-affairs/changelogs", "/site-affairs/blackroom",
  ];
  return routes.map((route, index) => ({
    url: `${siteURL}${route}`,
    changeFrequency: route === "" ? "daily" : "hourly",
    priority: index === 0 ? 1 : 0.8,
  }));
}
