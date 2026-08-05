import { Suspense } from "react";
import { ModCatalog } from "../_components/mod-catalog";

export default function ModpacksPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[var(--background)]" />}><ModCatalog projectType="modpack" /></Suspense>;
}
