import { ModExportEntryPage } from "../../../../../../_components/mod-export-pages";

export default async function Page({ params, searchParams }: {
  params: Promise<{ siteId: string; revisionId: string; category: string }>;
  searchParams: Promise<{ registry?: string; objectId?: string }>;
}) {
  const [{ siteId, revisionId, category }, query] = await Promise.all([params, searchParams]);
  return <ModExportEntryPage siteId={siteId} revisionId={revisionId} categoryKey={category} registry={query.registry ?? ""} objectId={query.objectId ?? ""} />;
}
