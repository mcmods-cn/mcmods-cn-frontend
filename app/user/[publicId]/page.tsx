import { UserProfile } from "../../_components/user-profile";
import { Suspense } from "react";

export default async function UserProfilePage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <Suspense fallback={null}><UserProfile userId={publicId} /></Suspense>;
}
