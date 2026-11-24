import { useEffect, useRef } from "react";

// The route remounts the editor when its account or record changes.
export function useEditorWrite() {
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort(); active.current = null; };
  }, []);

  function beginWrite() {
    if (!mounted.current || active.current) return null;
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
