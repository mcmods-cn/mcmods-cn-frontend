import { ContentHistory } from "../../../_components/content-history";

export default async function PluginsHistoryPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <ContentHistory endpoint={`/api/v1/content-projects/plugin/${encodeURIComponent(siteId)}/history`} backHref={`/plugins/${encodeURIComponent(siteId)}`} titleKey="largeProjects.types.plugin" />; }
