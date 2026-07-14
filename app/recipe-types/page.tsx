import { Suspense } from "react";
import { RecipeTypeCatalog } from "../_components/global-catalog";

export default function RecipeTypesPage() {
  return <Suspense><RecipeTypeCatalog /></Suspense>;
}
