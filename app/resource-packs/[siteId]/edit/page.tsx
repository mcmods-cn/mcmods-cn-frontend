import { SimpleProjectEditor } from "../../../_components/simple-project-editor";

export default async function EditResourcePacksPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectEditor projectType="resource_pack" siteId={siteId} />; }
