import { ModImportHistory } from "../../../_components/mod-import-history";
import { ModHistory } from "../../../_components/mod-history";

export default async function ModHistoryPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ importRevisionId?: string }> }) {
  const { siteId } = await params;
  const { importRevisionId } = await searchParams;
  if (importRevisionId) return <ModImportHistory siteId={siteId} revisionId={importRevisionId} />;
  return <ModHistory siteId={siteId} />;
}
