import { LegacyModDataRedirect } from "../../../../../../_components/legacy-mod-data-redirect";

export default async function Page({ params, searchParams }: {
  params: Promise<{ siteId: string; revisionId: string; category: string }>;
  searchParams: Promise<{ entityId?: string; registry?: string; objectId?: string }>;
}) {
  const [{ siteId, revisionId, category }, query] = await Promise.all([params, searchParams]);
  return <LegacyModDataRedirect
    siteId={siteId}
    revisionId={revisionId}
    category={category}
    entry={{ entityId: query.entityId, registry: query.registry, objectId: query.objectId }}
  />;
}
