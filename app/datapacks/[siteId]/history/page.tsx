import { ContentHistory } from "../../../_components/content-history";

export default async function DatapacksHistoryPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <ContentHistory endpoint={`/api/v1/content-projects/datapack/${encodeURIComponent(siteId)}/history`} backHref={`/datapacks/${encodeURIComponent(siteId)}`} titleKey="largeProjects.types.datapack" />; }
