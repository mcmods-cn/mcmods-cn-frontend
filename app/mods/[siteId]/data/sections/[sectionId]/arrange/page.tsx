import { ModContentLayoutEditorPage } from "../../../../../../_components/mod-content-layout-editor";

export default async function Page({ params }: { params: Promise<{ siteId: string; sectionId: string }> }) {
  const { siteId, sectionId } = await params;
  return <ModContentLayoutEditorPage sectionId={sectionId} siteId={siteId} />;
}
