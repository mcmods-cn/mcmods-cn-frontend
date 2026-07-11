import { ModHistory } from "../../../_components/mod-history";

export default async function ModHistoryPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <ModHistory siteId={siteId} />;
}
