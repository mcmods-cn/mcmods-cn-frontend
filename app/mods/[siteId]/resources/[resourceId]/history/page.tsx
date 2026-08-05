import { ContentHistory } from "../../../../../_components/content-history";

export default async function Page({ params, searchParams }: { params: Promise<{ siteId: string; resourceId: string }>; searchParams: Promise<{ version?: string; section?: string }> }) {
  const [{ siteId, resourceId }, query] = await Promise.all([params, searchParams]);
  const version = query.version || "";
  const detailQuery = new URLSearchParams();
  if (version) detailQuery.set("version", version);
  if (query.section) detailQuery.set("section", query.section);
  const historyQuery = new URLSearchParams({ version });
  return <ContentHistory
    backHref={`/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}${detailQuery.size ? `?${detailQuery}` : ""}`}
    endpoint={`/api/v1/mods/${encodeURIComponent(siteId)}/content-resources/${encodeURIComponent(resourceId)}/history?${historyQuery}`}
    titleKey="contentHistory.resourceTitle"
  />;
}
