import type { Metadata } from "next";
import { LogShareViewer } from "../../../_components/log-share-viewer";

export const metadata: Metadata = { title: "脱敏日志", robots: { index: false, follow: false, nocache: true } };

export default async function LogSharePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LogShareViewer code={code} />;
}
