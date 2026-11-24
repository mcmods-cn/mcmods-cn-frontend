"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { shouldPersistAutoDraft } from "./auto-draft-save-state";
import { completeUserDraft, loadUserDraft, saveUserDraft } from "./draft-api";

const autosaveIntervalMilliseconds = 15_000;

type DraftWriter = {
  signal: AbortSignal;
  storageKey: string;
  saving?: Promise<void>;
  completing?: Promise<void>;
};

export type AutoDraftStatus = "idle" | "restoring" | "restored" | "saving" | "saved" | "error";

export function useAutoDraft<T extends object>({
  draftKey,
  projectKey,
  editUrl,
  enabled,
  kind,
  title,
  token,
  value,
  onRestore,
  matchesStoredDraft,
}: {
  draftKey: string;
  projectKey: string;
  editUrl: string;
  enabled: boolean;
  kind: string;
  title: string;
  token?: string;
  value: T;
  onRestore: (payload: T) => void;
  matchesStoredDraft?: (storedKey: string, payload: T) => boolean;
}) {
  const [status, setStatus] = useState<AutoDraftStatus>("idle");
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const valueRef = useRef(value);
  const restoreRef = useRef(onRestore);
  const matchesStoredRef = useRef(matchesStoredDraft);
  const metadataRef = useRef({ draftKey, projectKey, editUrl, kind, title });
  const lastSavedRef = useRef("");
  const initializedKeyRef = useRef("");
  const restoringRef = useRef(false);
  const writerRef = useRef<DraftWriter | undefined>(undefined);

  useEffect(() => {
    const scope = new AbortController();
    writerRef.current = { signal: scope.signal, storageKey: draftKey };
    return () => scope.abort();
  }, [draftKey, token]);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { restoreRef.current = onRestore; matchesStoredRef.current = matchesStoredDraft; }, [onRestore, matchesStoredDraft]);
  useEffect(() => { metadataRef.current = { draftKey, projectKey, editUrl, kind, title }; }, [draftKey, editUrl, kind, projectKey, title]);

  useEffect(() => {
    if (!enabled || !token || initializedKeyRef.current === draftKey) return;
    initializedKeyRef.current = draftKey;
    const initial = serializeDraft(valueRef.current);
    lastSavedRef.current = initial;
    const draftID = new URLSearchParams(window.location.search).get("draft");
    if (!draftID) return;
    let cancelled = false;
    restoringRef.current = true;
    Promise.resolve()
      .then(() => {
        if (cancelled) return undefined;
        setStatus("restoring");
        return loadUserDraft<T>(draftID, token);
      })
      .then((draft) => {
        if (!draft || cancelled) return;
        const matches = matchesStoredRef.current?.(draft.draftKey, draft.payload) ?? (draft.draftKey === draftKey);
        if (!matches) throw new Error("draft editor does not match");
        // An explicit resume continues and completes the same persisted draft.
        if (writerRef.current) writerRef.current.storageKey = draft.draftKey;
        const restored = serializeDraft(draft.payload);
        lastSavedRef.current = restored;
        restoreRef.current(draft.payload);
        setSavedAt(draft.updatedAt);
        setStatus("restored");
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      })
      .finally(() => { restoringRef.current = false; });
    return () => { cancelled = true; };
  }, [draftKey, enabled, token]);

  const saveLatest = useCallback((keepalive = false) => {
    const writer = writerRef.current;
    if (!enabled || !token || !writer || writer.signal.aborted || restoringRef.current || writer.saving || writer.completing) return;
    const serialized = serializeDraft(valueRef.current);
    if (!shouldPersistAutoDraft(serialized, lastSavedRef.current)) return;
    setStatus("saving");
    const persistCurrent = async (allowKeepalive: boolean) => {
      const payload = valueRef.current;
      const snapshot = serializeDraft(payload);
      if (!shouldPersistAutoDraft(snapshot, lastSavedRef.current)) return false;
      const result = await saveUserDraft({ ...metadataRef.current, draftKey: writer.storageKey, payload }, token, allowKeepalive && snapshot.length < 60_000);
      if (writer.signal.aborted) return false;
      lastSavedRef.current = snapshot;
      setSavedAt(result.updatedAt);
      setError("");
      setStatus("saved");
      return true;
    };
    const request = (async () => {
      try {
        const savedOnce = await persistCurrent(keepalive);
        const latest = serializeDraft(valueRef.current);
        if (savedOnce && !writer.completing && shouldPersistAutoDraft(latest, lastSavedRef.current)) {
          setStatus("saving");
          await persistCurrent(false);
        }
      } catch (cause) {
        if (writer.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      }
    })().finally(() => { writer.saving = undefined; });
    writer.saving = request;
    return request;
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled || !token) return;
    const timer = window.setInterval(() => { void saveLatest(); }, autosaveIntervalMilliseconds);
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") void saveLatest(true);
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [enabled, saveLatest, token]);

  const completeDraft = useCallback((completion: {
    projectKey: string;
    projectTitle: string;
    targetUrl: string;
    changeRequestId?: string;
    reviewTargetType?: "server";
    reviewTargetPublicId?: string;
  }) => {
    if (!token) return Promise.resolve();
    const writer = writerRef.current;
    if (!writer || writer.signal.aborted) return Promise.reject(new DOMException("Editor closed", "AbortError"));
    if (writer.completing) return writer.completing;
    const input = { ...metadataRef.current, draftKey: writer.storageKey, ...completion, payload: valueRef.current };
    const request = (async () => {
      // An active-draft write delivered after completion creates a new draft row.
      await writer.saving;
      writer.signal.throwIfAborted();
      await completeUserDraft(input, token);
      if (writer.signal.aborted) return;
      lastSavedRef.current = serializeDraft(input.payload);
      setSavedAt("");
      setStatus("idle");
      setError("");
    })().finally(() => { writer.completing = undefined; });
    writer.completing = request;
    return request;
  }, [token]);

  return { completeDraft, error, savedAt, status };
}

function serializeDraft(value: object) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
