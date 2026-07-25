import { CommentThread } from "../../_components/comment-section";

export default async function CommentThreadPage({ params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params;
  return <CommentThread commentId={commentId} />;
}
