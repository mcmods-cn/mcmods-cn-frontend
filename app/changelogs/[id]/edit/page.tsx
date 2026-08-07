import { ProjectChangelogEditor } from "../../../_components/project-changelog-editor";

export default async function EditChangelogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectChangelogEditor id={id} />;
}
