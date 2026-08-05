import { ContentHistory } from "../../../_components/content-history";

export default async function ModpackHistoryPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <ContentHistory endpoint={`/api/v1/modpacks/${encodeURIComponent(siteId)}/history`} backHref={`/modpacks/${encodeURIComponent(siteId)}`} titleKey="modpacks.title" />;
}
