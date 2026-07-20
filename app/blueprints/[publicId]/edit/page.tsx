import { LocalizedAssetEditor } from "../../../_components/localized-asset-editor";

export default async function BlueprintEditPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <LocalizedAssetEditor kind="blueprint" publicId={publicId} />;
}
