import { ModEditor } from "../../_components/mod-editor";

export default async function NewModPage({ searchParams }: { searchParams: Promise<{ method?: string; url?: string }> }) {
  const params = await searchParams;
  return <ModEditor importMethod={params.method ?? "manual"} importURL={params.url ?? ""} />;
}
