import { ModpackEditor } from "../../_components/modpack-editor";

export default async function NewModpackPage({ searchParams }: { searchParams: Promise<{ method?: string; url?: string }> }) {
  const params = await searchParams;
  return <ModpackEditor importMethod={params.method ?? "manual"} importURL={params.url ?? ""} />;
}
