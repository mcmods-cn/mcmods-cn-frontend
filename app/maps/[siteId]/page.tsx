import { SimpleProjectDetailLoader } from "../../_components/simple-project-detail";

export default async function MapsDetailPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectDetailLoader projectType="map" siteId={siteId} />; }
