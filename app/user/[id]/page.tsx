import { UserProfile } from "../../_components/user-profile";
import { Suspense } from "react";

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={null}><UserProfile userId={Number(id)} /></Suspense>;
}
