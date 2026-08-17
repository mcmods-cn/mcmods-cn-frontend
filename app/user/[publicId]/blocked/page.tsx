import { UserNetworkList } from "../../../_components/user-network-list";

export default async function UserBlockedPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <UserNetworkList key={`${publicId}:blocked`} network="blocked" userId={publicId} />;
}
