import { SimpleProjectDetailLoader } from "../../_components/simple-project-detail";

export default async function ResourcePacksDetailPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectDetailLoader projectType="resource_pack" siteId={siteId} />; }
