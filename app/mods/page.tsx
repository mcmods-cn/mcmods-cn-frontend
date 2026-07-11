import { Suspense } from "react";
import { ModCatalog } from "../_components/mod-catalog";

export default function ModsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--background)]" />}>
      <ModCatalog />
    </Suspense>
  );
}
