import { MessagesCenter } from "../_components/messages-center";
import { Suspense } from "react";

export default function MessagesPage() {
  return <Suspense fallback={null}><MessagesCenter /></Suspense>;
}
