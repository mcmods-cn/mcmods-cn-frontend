import { ModEditor } from "../../../_components/mod-editor";

export default async function EditModPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <ModEditor siteId={siteId} />;
}
