import { ModExportCategoryPage } from "../../../../../_components/mod-export-pages";

export default async function Page({ params }: { params: Promise<{ siteId: string; revisionId: string; category: string }> }) {
  const { siteId, revisionId, category } = await params;
  return <ModExportCategoryPage siteId={siteId} revisionId={revisionId} categoryKey={category} />;
}
