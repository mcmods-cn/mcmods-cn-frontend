import { ModContentManager } from "../../../../_components/mod-content-manager";

export default async function EditModContentPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ import?: string; version?: string; new?: string }> }) {
  const { siteId } = await params;
  const query = await searchParams;
  const importSource = query.import === "icon" || query.import === "exporter" ? query.import : "";
  return <ModContentManager createNew={query.new === "1"} importSource={importSource} siteId={siteId} versionId={query.version || ""} />;
}
