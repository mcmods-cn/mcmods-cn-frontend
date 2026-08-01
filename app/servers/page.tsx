import { Suspense } from "react";
import { ServerCatalog } from "../_components/server-catalog";

export default function ServersPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--background)]" />}>
      <ServerCatalog />
    </Suspense>
  );
}
