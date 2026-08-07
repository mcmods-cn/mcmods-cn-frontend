import { ProjectChangelogHistory } from "../../../_components/project-changelog-history";

export default async function ChangelogHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectChangelogHistory id={id} />;
}
