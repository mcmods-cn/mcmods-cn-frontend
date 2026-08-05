import { SimpleProjectDetailLoader } from "../../_components/simple-project-detail";

export default async function ShadersDetailPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectDetailLoader projectType="shader_pack" siteId={siteId} />; }
