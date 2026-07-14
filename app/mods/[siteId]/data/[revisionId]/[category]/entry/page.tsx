import { ModExportEntryPage } from "../../../../../../_components/mod-export-pages";

export default async function Page({ params, searchParams }: {
  params: Promise<{ siteId: string; revisionId: string; category: string }>;
  searchParams: Promise<{ entityId?: string; registry?: string; objectId?: string }>;
}) {
  const [{ siteId, revisionId, category }, query] = await Promise.all([params, searchParams]);
  return <ModExportEntryPage siteId={siteId} revisionId={revisionId} categoryKey={category} entityId={query.entityId ?? ""} registry={query.registry ?? ""} objectId={query.objectId ?? ""} />;
}
