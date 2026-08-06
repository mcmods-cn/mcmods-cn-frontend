"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { completeUserDraft, loadUserDraft, saveUserDraft } from "./draft-api";

const autosaveIntervalMilliseconds = 15_000;

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
}) {
  const [status, setStatus] = useState<AutoDraftStatus>("idle");
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const valueRef = useRef(value);
  const restoreRef = useRef(onRestore);
  const metadataRef = useRef({ draftKey, projectKey, editUrl, kind, title });
  const baselineRef = useRef("");
  const lastSavedRef = useRef("");
  const initializedKeyRef = useRef("");
  const restoringRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { restoreRef.current = onRestore; }, [onRestore]);
  useEffect(() => { metadataRef.current = { draftKey, projectKey, editUrl, kind, title }; }, [draftKey, editUrl, kind, projectKey, title]);

  useEffect(() => {
    if (!enabled || !token || initializedKeyRef.current === draftKey) return;
    initializedKeyRef.current = draftKey;
    const initial = serializeDraft(valueRef.current);
    baselineRef.current = initial;
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
        if (draft.draftKey !== draftKey) throw new Error("draft editor does not match");
        const restored = serializeDraft(draft.payload);
        baselineRef.current = restored;
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

  const saveLatest = useCallback(async (keepalive = false) => {
    if (!enabled || !token || restoringRef.current || savingRef.current) return;
    const serialized = serializeDraft(valueRef.current);
    if (!serialized || serialized === baselineRef.current || serialized === lastSavedRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const metadata = metadataRef.current;
      const result = await saveUserDraft({ ...metadata, payload: valueRef.current }, token, keepalive && serialized.length < 60_000);
      lastSavedRef.current = serialized;
      setSavedAt(result.updatedAt);
      setError("");
      setStatus("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    } finally {
      savingRef.current = false;
    }
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

  const completeDraft = useCallback(async (completion: {
    projectKey: string;
    projectTitle: string;
    targetUrl: string;
    reviewStatus: "pending" | "approved";
    changeRequestId?: string;
    reviewTargetType?: "server";
    reviewTargetPublicId?: string;
  }) => {
    if (!token) return;
    await completeUserDraft({
      ...metadataRef.current,
      ...completion,
      payload: valueRef.current,
    }, token);
    const current = serializeDraft(valueRef.current);
    baselineRef.current = current;
    lastSavedRef.current = current;
    setSavedAt("");
    setStatus("idle");
    setError("");
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
