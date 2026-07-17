import { CreatorDetail } from "../../_components/creator-detail";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <CreatorDetail kind="team" publicId={publicId} />;
}
