import { UserNetworkList } from "../../../_components/user-network-list";

export default async function UserFollowersPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <UserNetworkList key={`${publicId}:followers`} network="followers" userId={publicId} />;
}
