import { SimpleProjectEditor } from "../../../_components/simple-project-editor";

export default async function EditDatapacksPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectEditor projectType="datapack" siteId={siteId} />; }
