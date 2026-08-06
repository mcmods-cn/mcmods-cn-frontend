import { SimpleProjectEditor } from "../../_components/simple-project-editor";

export default async function NewShadersPage({ searchParams }: { searchParams: Promise<{ method?: string; url?: string }> }) {
  const params = await searchParams;
  return <SimpleProjectEditor importMethod={params.method ?? "manual"} importURL={params.url ?? ""} projectType="shader_pack" />;
}
