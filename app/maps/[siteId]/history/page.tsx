import { ContentHistory } from "../../../_components/content-history";

export default async function MapsHistoryPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <ContentHistory endpoint={`/api/v1/content-projects/map/${encodeURIComponent(siteId)}/history`} backHref={`/maps/${encodeURIComponent(siteId)}`} titleKey="largeProjects.types.map" />; }
