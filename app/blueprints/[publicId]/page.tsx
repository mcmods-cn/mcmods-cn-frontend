import { BlueprintDetail } from "../../_components/blueprint-detail";

export default async function BlueprintDetailPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <BlueprintDetail publicId={publicId} />;
}
