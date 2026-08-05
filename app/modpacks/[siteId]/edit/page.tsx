import { ModpackEditor } from "../../../_components/modpack-editor";

export default async function EditModpackPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <ModpackEditor siteId={siteId} />;
}
