"use client";

import { useEffect, useState } from "react";

type Page = { hasMore: boolean; nextCursor: string };

// A new cursor only becomes the displayed page after its read succeeds.
export function useHistoryPage<T extends Page>(ready: boolean, read: (cursor: string, signal: AbortSignal) => Promise<T>, fallbackError: string) {
  const [requested, setRequested] = useState({ path: [""] });
  const [loaded, setLoaded] = useState<{ path: string[]; page: T }>();
  const [failure, setFailure] = useState<{ request: typeof requested; message: string }>();
  const cursor = requested.path.at(-1) || "";

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    read(cursor, controller.signal).then(page => {
      if (!controller.signal.aborted) {
        setLoaded({ path: requested.path, page });
        setFailure(undefined);
      }
    }).catch(error => {
      if (!controller.signal.aborted) setFailure({ request: requested, message: error instanceof Error ? error.message : fallbackError });
    });
    return () => controller.abort();
  }, [cursor, fallbackError, ready, read, requested]);

  const message = failure?.request === requested ? failure.message : "";
  const loading = !message && loaded?.path !== requested.path;
  const path = loaded?.path ?? [""];
  const page = loaded?.page;
  const request = (path: string[]) => setRequested({ path });

  return {
    page: loading ? undefined : page,
    message, loading,
    pageNumber: path.length,
    hasPagination: Boolean(page?.hasMore || path.length > 1),
    canGoBack: !loading && path.length > 1,
    canGoNext: !loading && !message && Boolean(page?.hasMore && page.nextCursor),
    previous: () => { if (path.length > 1) request(path.slice(0, -1)); },
    next: () => { if (page?.hasMore && page.nextCursor) request([...path, page.nextCursor]); },
    retry: () => request(requested.path),
  };
}
