import { Suspense } from "react";
import { CatalogPageFallback } from "../_components/catalog-list-ui";
import { SimpleProjectCatalog } from "../_components/simple-project-catalog";

export default function PluginsPage() { return <Suspense fallback={<CatalogPageFallback />}><SimpleProjectCatalog projectType="plugin" /></Suspense>; }
