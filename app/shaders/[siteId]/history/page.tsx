import { ContentHistory } from "../../../_components/content-history";

export default async function ShadersHistoryPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <ContentHistory endpoint={`/api/v1/content-projects/shader_pack/${encodeURIComponent(siteId)}/history`} backHref={`/shaders/${encodeURIComponent(siteId)}`} titleKey="largeProjects.types.shader_pack" />; }
