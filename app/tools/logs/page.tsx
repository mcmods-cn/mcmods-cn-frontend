import type { Metadata } from "next";
import { LogShareTool } from "../../_components/log-share-tool";

export const metadata: Metadata = { title: "日志查看与分享器", robots: { index: false, follow: false } };

export default function LogShareToolPage() { return <LogShareTool />; }
