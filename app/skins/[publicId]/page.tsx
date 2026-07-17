import { SkinDetail } from "../../_components/skin-detail";

export default async function SkinDetailPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <SkinDetail publicId={publicId} />;
}
