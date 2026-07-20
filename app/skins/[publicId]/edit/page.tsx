import { LocalizedAssetEditor } from "../../../_components/localized-asset-editor";

export default async function SkinEditPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <LocalizedAssetEditor kind="skin" publicId={publicId} />;
}
