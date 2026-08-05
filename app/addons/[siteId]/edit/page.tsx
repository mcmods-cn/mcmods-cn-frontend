import { SimpleProjectEditor } from "../../../_components/simple-project-editor";

export default async function EditAddonsPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectEditor projectType="addon" siteId={siteId} />; }
