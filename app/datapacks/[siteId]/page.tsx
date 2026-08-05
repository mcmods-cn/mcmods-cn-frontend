import { SimpleProjectDetailLoader } from "../../_components/simple-project-detail";

export default async function DatapacksDetailPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectDetailLoader projectType="datapack" siteId={siteId} />; }
