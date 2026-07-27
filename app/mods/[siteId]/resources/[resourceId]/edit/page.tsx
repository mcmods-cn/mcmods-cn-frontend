import { ModContentResourceEditor } from "../../../../../_components/mod-content-resource-editor";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; resourceId: string }>;
  searchParams: Promise<{ version?: string; section?: string }>;
}) {
  const [{ siteId, resourceId }, query] = await Promise.all([params, searchParams]);
  return <ModContentResourceEditor
    mode="edit"
    resourceId={resourceId}
    sectionId={query.section || ""}
    siteId={siteId}
    versionId={query.version || ""}
  />;
}
