import { Suspense } from "react";
import { CatalogPageFallback } from "../_components/catalog-list-ui";
import { ModCatalog } from "../_components/mod-catalog";

export default function ModpacksPage() {
  return <Suspense fallback={<CatalogPageFallback />}><ModCatalog projectType="modpack" /></Suspense>;
}
