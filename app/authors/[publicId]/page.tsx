import { CreatorDetail } from "../../_components/creator-detail";

export default async function AuthorDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <CreatorDetail kind="author" publicId={publicId} />;
}
