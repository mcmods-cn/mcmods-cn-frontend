import { ContentHistory } from "../../../_components/content-history";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContentHistory backHref={`/issues/${encodeURIComponent(id)}`} endpoint={`/api/v1/community/posts/${encodeURIComponent(id)}/history`} titleKey="communityPosts.issue.title" />;
}
