import { Suspense } from "react";
import { SiteLoginPanel } from "../_components/site-login-panel";

export default function LoginPage() {
  return (
    <Suspense>
      <SiteLoginPanel />
    </Suspense>
  );
}
