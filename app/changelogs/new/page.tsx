import { ProjectChangelogEditor } from "../../_components/project-changelog-editor";
import type { ChangelogTargetType } from "../../_lib/project-changelog-api";

export default async function NewChangelogPage({ searchParams }: { searchParams: Promise<{ targetType?: string; targetId?: string }> }) {
  const query = await searchParams;
  return <ProjectChangelogEditor targetId={query.targetId || ""} targetType={query.targetType as ChangelogTargetType} />;
}
