import { CreatorMemberManager } from "../../../_components/creator-member-manager";

export default async function ManageTeamMembersPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <CreatorMemberManager publicId={publicId} />;
}
