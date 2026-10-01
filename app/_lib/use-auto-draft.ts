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
  const lastSavedRef = useRef("");
  const initializedKeyRef = useRef("");
  const restoringRef = useRef(false);
  const restoreGenerationRef = useRef(0);
  const savingRef = useRef(false);
  const inFlightSaveRef = useRef<Promise<unknown> | null>(null);
  const completingRef = useRef(false);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { restoreRef.current = onRestore; }, [onRestore]);
  useEffect(() => { metadataRef.current = { draftKey, projectKey, editUrl, kind, title }; }, [draftKey, editUrl, kind, projectKey, title]);

  useEffect(() => {
    if (!enabled || !token || initializedKeyRef.current === draftKey) return;
    initializedKeyRef.current = draftKey;
    const initial = serializeDraft(valueRef.current);
    lastSavedRef.current = initial;
    const draftID = new URLSearchParams(window.location.search).get("draft");
    if (!draftID) return;
    let cancelled = false;
    let settled = false;
    const restoreGeneration = restoreGenerationRef;
    const generation = ++restoreGeneration.current;
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
      .finally(() => {
        settled = true;
        if (restoreGeneration.current === generation) restoringRef.current = false;
      });
    return () => {
      cancelled = true;
      // A cancelled restoration has not initialized this editor. In particular,
      // React StrictMode replays effects before the first request microtask.
      if (!settled && initializedKeyRef.current === draftKey) initializedKeyRef.current = "";
      if (restoreGeneration.current === generation) restoringRef.current = false;
    };
  }, [draftKey, enabled, token]);

  const saveLatest = useCallback(async (keepalive = false) => {
    if (!enabled || !token || restoringRef.current || savingRef.current || completingRef.current) return;
    const serialized = serializeDraft(valueRef.current);
    if (!serialized || serialized === lastSavedRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const metadata = metadataRef.current;
      const request = saveUserDraft({ ...metadata, payload: valueRef.current }, token, keepalive && serialized.length < 60_000);
      inFlightSaveRef.current = request;
      const result = await request;
      lastSavedRef.current = serialized;
      setSavedAt(result.updatedAt);
      setError("");
      setStatus("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    } finally {
      savingRef.current = false;
      inFlightSaveRef.current = null;
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
    if (!token || completingRef.current) return;
    completingRef.current = true;
    try {
      // Preserve the write order: a late autosave must not reopen a completed
      // draft. The completion request carries the current payload itself.
      await inFlightSaveRef.current?.catch(() => undefined);
      await completeUserDraft({
        ...metadataRef.current,
        ...completion,
        payload: valueRef.current,
      }, token);
      lastSavedRef.current = serializeDraft(valueRef.current);
      setSavedAt("");
      setStatus("idle");
      setError("");
    } finally {
      completingRef.current = false;
    }
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
