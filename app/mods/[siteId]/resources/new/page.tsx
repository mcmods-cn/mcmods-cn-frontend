import { ModContentResourceEditor } from "../../../../_components/mod-content-resource-editor";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ version?: string; section?: string }>;
}) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  return <ModContentResourceEditor
    mode="create"
    sectionId={query.section || ""}
    siteId={siteId}
    versionId={query.version || ""}
  />;
}
