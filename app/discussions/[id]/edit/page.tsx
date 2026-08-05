import { CommunityPostEditor } from "../../../_components/community-post-editor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <CommunityPostEditor id={(await params).id} kind="discussion" />; }
