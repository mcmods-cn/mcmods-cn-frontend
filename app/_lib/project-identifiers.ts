const maximumProjectSiteIdLength = 100;

export function normalizeProjectSiteIdInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, maximumProjectSiteIdLength);
}
