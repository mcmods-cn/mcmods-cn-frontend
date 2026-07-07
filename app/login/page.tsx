import { Suspense } from "react";
import { SiteLoginPanelClean } from "../_components/site-login-panel-clean";

export default function LoginPage() {
  return (
    <Suspense>
      <SiteLoginPanelClean />
    </Suspense>
  );
}
