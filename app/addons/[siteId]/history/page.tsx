import { ContentHistory } from "../../../_components/content-history";

export default async function AddonsHistoryPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <ContentHistory endpoint={`/api/v1/content-projects/addon/${encodeURIComponent(siteId)}/history`} backHref={`/addons/${encodeURIComponent(siteId)}`} titleKey="largeProjects.types.addon" />; }
