import { ModContentSectionPage } from "../../../../../_components/mod-content-section-page";

export default async function Page({ params }: { params: Promise<{ siteId: string; sectionId: string }> }) {
  const { siteId, sectionId } = await params;
  return <ModContentSectionPage sectionId={sectionId} siteId={siteId} />;
}
