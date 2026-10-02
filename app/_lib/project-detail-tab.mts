export function parseProjectDetailTab<Tab extends string>(
  candidate: string | null | undefined,
  tabs: readonly Tab[],
  fallback: Tab,
): Tab {
  return candidate && tabs.includes(candidate as Tab) ? candidate as Tab : fallback;
}

export function projectDetailTabHref<Tab extends string>(
  pathname: string,
  currentQuery: string,
  selectedTab: Tab,
  defaultTab: Tab,
  currentHash = "",
) {
  const parameters = new URLSearchParams(currentQuery);
  if (selectedTab === defaultTab) parameters.delete("tab");
  else parameters.set("tab", selectedTab);
  const query = parameters.size ? `?${parameters.toString()}` : "";
  const hash = currentHash
    ? currentHash.startsWith("#") ? currentHash : `#${currentHash}`
    : "";
  return `${pathname}${query}${hash}`;
}
