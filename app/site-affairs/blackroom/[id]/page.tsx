import { BlackroomDetailPage } from "../../../_components/site-affairs-pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <BlackroomDetailPage id={id} />; }
