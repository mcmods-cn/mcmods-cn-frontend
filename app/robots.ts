import type { MetadataRoute } from "next";

const siteURL = (process.env.NEXT_PUBLIC_SITE_URL || "https://mcmods.cn").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/login",
        "/messages/",
        "/permissions/",
        "/user/",
        "/*?*cursor=",
        "/*?*page=0",
        "/*?*sort=",
        "/*?*search=",
      ],
    },
    sitemap: `${siteURL}/sitemap.xml`,
    host: siteURL,
  };
}
