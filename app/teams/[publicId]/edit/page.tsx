import { CreatorEditorPage } from "../../../_components/creator-editor";

export default async function EditTeamPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <CreatorEditorPage initialKind="team" publicId={publicId} />;
}
