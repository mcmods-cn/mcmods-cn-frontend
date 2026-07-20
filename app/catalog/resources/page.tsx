import { Suspense } from "react";
import { CatalogResourceCatalog } from "../../_components/catalog-resource-catalog";

export default function Page() {
  return <Suspense><CatalogResourceCatalog /></Suspense>;
}
