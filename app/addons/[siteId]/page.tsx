import { SimpleProjectDetailLoader } from "../../_components/simple-project-detail";

export default async function AddonsDetailPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectDetailLoader projectType="addon" siteId={siteId} />; }
