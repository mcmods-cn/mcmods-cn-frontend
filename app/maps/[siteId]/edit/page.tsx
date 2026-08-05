import { SimpleProjectEditor } from "../../../_components/simple-project-editor";

export default async function EditMapsPage({ params }: { params: Promise<{ siteId: string }> }) { const { siteId } = await params; return <SimpleProjectEditor projectType="map" siteId={siteId} />; }
