"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseProjectDetailTab, projectDetailTabHref } from "../_lib/project-detail-tab.mts";

export function useProjectDetailTab<Tab extends string>(
  tabs: readonly Tab[],
  defaultTab: Tab,
) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseProjectDetailTab(searchParams.get("tab"), tabs, defaultTab);

  const selectTab = useCallback((nextTab: Tab) => {
    const selected = parseProjectDetailTab(nextTab, tabs, defaultTab);
    const query = searchParams.toString();
    const hash = window.location.hash;
    const target = projectDetailTabHref(pathname, query, selected, defaultTab, hash);
    const current = `${pathname}${query ? `?${query}` : ""}${hash}`;
    if (target === current) return;
    router.push(target, { scroll: false });
  }, [defaultTab, pathname, router, searchParams, tabs]);

  return { tab, selectTab };
}
