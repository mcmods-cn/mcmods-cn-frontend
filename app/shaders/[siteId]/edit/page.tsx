import { SimpleProjectEditor } from "../../../_components/simple-project-editor";

export default async function EditShadersPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectEditor projectType="shader_pack" siteId={siteId} />; }
