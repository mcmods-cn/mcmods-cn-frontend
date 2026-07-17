import { PlayerProfileDetail } from "../../_components/player-profile-detail";

export default async function PlayerProfilePage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <PlayerProfileDetail publicId={publicId} />;
}
