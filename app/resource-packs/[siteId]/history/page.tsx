import { ContentHistory } from "../../../_components/content-history";

export default async function ResourcePacksHistoryPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <ContentHistory endpoint={`/api/v1/content-projects/resource_pack/${encodeURIComponent(siteId)}/history`} backHref={`/resource-packs/${encodeURIComponent(siteId)}`} titleKey="largeProjects.types.resource_pack" />; }
