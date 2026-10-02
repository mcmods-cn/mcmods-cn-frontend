import type { MetadataRoute } from "next";
import { resolvePublicSiteURL } from "./_lib/deployment-env.mts";

const siteURL = resolvePublicSiteURL(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV);

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
