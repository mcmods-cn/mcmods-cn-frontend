"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";

export type SiteBrand = {
  siteName: string;
  logoUrl: string;
};

const defaultSiteBrand: SiteBrand = { siteName: "Mcmods-cn", logoUrl: "" };
const SiteBrandContext = createContext<SiteBrand>(defaultSiteBrand);

export function SiteBrandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [brand, setBrand] = useState(defaultSiteBrand);
  const load = useCallback(() => {
    void apiRequest<Partial<SiteBrand>>("/api/v1/site/config", { cache: "no-store" })
      .then((value) => setBrand(normalizeSiteBrand(value)))
      .catch(() => setBrand(defaultSiteBrand));
  }, []);

  useEffect(load, [load]);
  const refreshBrand = useCallback(() => {
    load();
    router.refresh();
  }, [load, router]);
  useEffect(() => {
    window.addEventListener("mcmods-site-brand-change", refreshBrand);
    return () => window.removeEventListener("mcmods-site-brand-change", refreshBrand);
  }, [refreshBrand]);

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
  if (/^\/site-assets\/site-logo-[a-f0-9]{20}\.webp$/.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}
