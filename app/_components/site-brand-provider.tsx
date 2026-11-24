"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
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
  useEffect(() => {
    let pending: AbortController | undefined;
    function load() {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      void apiRequest<Partial<SiteBrand>>("/api/v1/site/config", { cache: "no-store", signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setBrand(normalizeSiteBrand(value));
        })
        .catch(() => {
          if (!controller.signal.aborted) setBrand(defaultSiteBrand);
        });
    }
    function refreshBrand() {
      load();
      router.refresh();
    }
    load();
    window.addEventListener("mcmods-site-brand-change", refreshBrand);
    return () => {
      pending?.abort();
      window.removeEventListener("mcmods-site-brand-change", refreshBrand);
    };
  }, [router]);

  return <SiteBrandContext.Provider value={brand}>{children}</SiteBrandContext.Provider>;
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
  if (/^\/site-assets\/site-logo-[a-z0-9]{9}\.png$/.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}
