import { ModpackDetailLoader } from "../../_components/modpack-detail";

export default async function ModpackDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <ModpackDetailLoader siteId={siteId} />;
}
