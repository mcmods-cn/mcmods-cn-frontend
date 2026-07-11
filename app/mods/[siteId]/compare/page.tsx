import { ModRevisionCompare } from "../../../_components/mod-history";

export default async function ModComparePage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ before?: string; after?: string }> }) {
  const { siteId } = await params;
  const query = await searchParams;
  return <ModRevisionCompare siteId={siteId} before={query.before ?? ""} after={query.after ?? ""} />;
}
