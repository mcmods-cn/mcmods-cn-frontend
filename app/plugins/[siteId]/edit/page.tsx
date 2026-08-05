import { SimpleProjectEditor } from "../../../_components/simple-project-editor";

export default async function EditPluginsPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectEditor projectType="plugin" siteId={siteId} />; }
