import { Suspense } from "react";
import { CatalogResourceCatalog } from "../../_components/catalog-resource-catalog";

export const metadata = { robots: { index: false, follow: false, nocache: true } };

export default function Page() {
  return <Suspense><CatalogResourceCatalog /></Suspense>;
}
