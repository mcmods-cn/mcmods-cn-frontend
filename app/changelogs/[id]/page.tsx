import { ProjectChangelogEntry } from "../../_components/project-changelog-entry";

export default async function ChangelogEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectChangelogEntry id={id} />;
}
