"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

export type SiteBrand = {
  siteName: string;
  logoUrl: string;
};

const defaultSiteBrand: SiteBrand = { siteName: "Mcmods-cn", logoUrl: "" };
const SiteBrandContext = createContext<SiteBrand>(defaultSiteBrand);

export function SiteBrandProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [brand, setBrand] = useState(defaultSiteBrand);
  const load = useCallback(() => {
    void apiRequest<Partial<SiteBrand>>("/api/v1/site/config", { cache: "no-store" })
      .then((value) => setBrand(normalizeSiteBrand(value)))
      .catch(() => setBrand(defaultSiteBrand));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    window.addEventListener("mcmods-site-brand-change", load);
    return () => window.removeEventListener("mcmods-site-brand-change", load);
  }, [load]);
  const documentTitle = pathname === "/admin" || pathname.startsWith("/admin/")
    ? `${brand.siteName} - ${t("admin.title")}`
    : brand.siteName;

  useEffect(() => {
    const applyTitle = () => {
      if (document.title !== documentTitle) document.title = documentTitle;
    };
    applyTitle();
    const observer = new MutationObserver(applyTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [documentTitle]);

  const value = useMemo(() => brand, [brand]);
  return <SiteBrandContext.Provider value={value}>{children}</SiteBrandContext.Provider>;
}

export function useSiteBrand() {
  return useContext(SiteBrandContext);
}

function normalizeSiteBrand(value: Partial<SiteBrand>): SiteBrand {
  const siteName = typeof value.siteName === "string" && value.siteName.trim() ? value.siteName.trim() : defaultSiteBrand.siteName;
  const logoUrl = safeHTTPURL(value.logoUrl);
  return { siteName, logoUrl };
}

function safeHTTPURL(value: unknown) {
	if (typeof value !== "string" || !value.trim()) return "";
	if (value.startsWith("/site-assets/site-logo-")) return value;
	try {
		const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}
