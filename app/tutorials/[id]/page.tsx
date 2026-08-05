import { CommunityPostDetail } from "../../_components/community-post-detail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <CommunityPostDetail id={(await params).id} />; }
