import { SimpleProjectDetailLoader } from "../../_components/simple-project-detail";

export default async function PluginsDetailPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectDetailLoader projectType="plugin" siteId={siteId} />; }
