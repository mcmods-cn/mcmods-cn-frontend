import { Suspense } from "react";
import { ServerDetail } from "../../_components/server-detail";

export default async function ServerDetailPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--background)]" />}>
      <ServerDetail serverId={serverId} />
    </Suspense>
  );
}
