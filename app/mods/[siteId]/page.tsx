import { ModDetailLoader } from "../../_components/mod-detail-loader";

export default async function ModDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <ModDetailLoader siteId={siteId} />;
}
