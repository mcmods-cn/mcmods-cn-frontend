import { UserNetworkList } from "../../../_components/user-network-list";

export default async function UserFollowingPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <UserNetworkList key={`${publicId}:following`} network="following" userId={publicId} />;
}
