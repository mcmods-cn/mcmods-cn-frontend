import { UserHome } from "../_components/user-home";
import { Suspense } from "react";

export default function UserPage() {
  return <Suspense fallback={null}><UserHome /></Suspense>;
}
