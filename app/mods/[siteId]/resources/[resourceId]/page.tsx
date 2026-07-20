import { ModContentResourceDetail } from "../../../../_components/mod-content-resource-detail";

export default async function Page({ params, searchParams }: { params: Promise<{ siteId: string; resourceId: string }>; searchParams: Promise<{ version?: string }> }) {
  const [{ siteId, resourceId }, query] = await Promise.all([params, searchParams]);
  return <ModContentResourceDetail resourceId={resourceId} siteId={siteId} versionId={query.version || ""} />;
}
