import { LegacyModDataRedirect } from "../../../../../_components/legacy-mod-data-redirect";

export default async function Page({ params }: { params: Promise<{ siteId: string; revisionId: string; category: string }> }) {
  const { siteId, revisionId, category } = await params;
  return <LegacyModDataRedirect siteId={siteId} revisionId={revisionId} category={category} />;
}
