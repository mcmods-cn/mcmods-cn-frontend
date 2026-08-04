import { CreatorEditorPage } from "../../../_components/creator-editor";

export default async function EditAuthorPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <CreatorEditorPage initialKind="author" publicId={publicId} />;
}
