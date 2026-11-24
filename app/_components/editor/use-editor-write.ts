import { useEffect, useRef } from "react";

// The route remounts the editor when its account or record changes.
export function useEditorWrite() {
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function beginWrite() {
    if (active.current) return null;
    active.current = new AbortController();
    return active.current;
  }

  function finishWrite(request: AbortController) {
    if (active.current !== request) return false;
    active.current = null;
    return !request.signal.aborted;
  }

  return { beginWrite, finishWrite };
}
