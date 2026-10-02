"use client";

import { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, RefObject, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { ApiError, apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { DRAWIO_ORIGIN, parseDrawioMessage, type DrawioEditorMessage } from "../_lib/drawio";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig, MarkdownRendererConfig, normalizeMarkdownConfig } from "../_lib/markdown-config";
import {
  applyMarkdownDraftSaveResult,
  createMarkdownDraftSaveCoordinator,
  issueMarkdownDraftSave,
  parseMarkdownDraftConflict,
  rebaseMarkdownDraftSaveCoordinator,
  type MarkdownDraftConflict,
} from "../_lib/markdown-draft-save.mts";
import { createMarkdownEditorSession, editMarkdownEditorSession, synchronizeMarkdownEditorSession } from "../_lib/markdown-editor-session.mts";
import { markdownForUploadedFile, uploadUserFileToOSS } from "../_lib/oss-upload";
import { MarkdownRenderer } from "./markdown-renderer";
import { StickerPicker } from "./sticker-picker";

type ViewMode = "edit" | "preview";
type DrawioEditSession = {
  open: boolean;
  xml: string;
  replaceStart: number;
  replaceEnd: number;
};
type MediaField = "bilibili" | "youtube" | "geogebra";
type MediaPreset = {
  fields: MediaField[];
  id: string;
  labelKey: string;
  template: string;
};
type MediaInsertSession = {
  end: number;
  initialValue: string;
  preset: MediaPreset;
  start: number;
};
type MarkdownCommand =
  | "bold"
  | "italic"
  | "strike"
  | "quote"
  | "unorderedList"
  | "orderedList"
  | "inlineCode"
  | "codeBlock"
  | "table"
  | "divider";

type ToolsPlaygroundSharedProps = {
  editorDescription?: string;
  editorTitle?: string;
  onBusyChange?: (busy: boolean) => void;
  uploadSource?: string;
};

type ToolsPlaygroundProps = ToolsPlaygroundSharedProps & (
  | { embedded: true; documentId: string; onChange: (markdown: string) => void; value: string }
  | { embedded?: false; documentId?: never; onChange?: never; value?: never }
);

const defaultDrawioXml =
  '<mxfile host="embed.diagrams.net"><diagram id="mcmods-markdown-diagram" name="Page 1"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
const iconPresets = {
  adaptive: [
    { labelKey: "tools.playground.iconHealth", preview: ["health-full", "health-half"], template: "[icon:health={{value}},点]" },
    { labelKey: "tools.playground.iconHealthEx", preview: ["health-full-ex", "health-half-ex"], template: "[icon:health-ex={{value}},点]" },
    { labelKey: "tools.playground.iconHunger", preview: ["food-full-hunger-level", "food-half-hunger-level"], template: "[icon:hunger-level={{value}},点]" },
    { labelKey: "tools.playground.iconSaturation", preview: ["food-empty-saturation-level-100", "food-empty-saturation-level-50"], template: "[icon:saturation-level={{value}},点]" },
    { labelKey: "tools.playground.iconArmor", preview: ["armor-full", "armor-half"], template: "[icon:armor={{value}},点]" },
    { labelKey: "tools.playground.iconToughness", preview: ["toughness-full", "toughness-half"], template: "[icon:toughness={{value}},点]" },
    { labelKey: "tools.playground.iconToughnessDiamond", preview: ["toughness-diamond-full", "toughness-diamond-half"], template: "[icon:toughness-diamond={{value}},点]" },
    { labelKey: "tools.playground.iconRegeneration", preview: ["health-full-buff-regeneration", "health-half-buff-regeneration"], template: "[icon:health-buff-regeneration={{value}},点]" },
    { labelKey: "tools.playground.iconPoison", preview: ["health-full-buff-poison", "health-half-buff-poison"], template: "[icon:health-buff-poison={{value}},点]" },
    { labelKey: "tools.playground.iconWither", preview: ["health-full-buff-wither", "health-half-buff-wither"], template: "[icon:health-buff-wither={{value}},点]" },
    { labelKey: "tools.playground.iconJockey", preview: ["health-full-jockey", "health-half-jockey"], template: "[icon:health-jockey={{value}},点]" },
  ],
  single: [
    { labelKey: "tools.playground.iconOxygenFull", preview: ["oxygen-full"], template: "[icon:oxygen-full]" },
    { labelKey: "tools.playground.iconOxygenEmpty", preview: ["oxygen-empty"], template: "[icon:oxygen-empty]" },
    { labelKey: "tools.playground.iconExp", preview: ["exp"], template: "[icon:exp]" },
    { labelKey: "tools.playground.iconArmorEmpty", preview: ["armor-empty"], template: "[icon:armor-empty]" },
    { labelKey: "tools.playground.iconHealthEmpty", preview: ["health-empty"], template: "[icon:health-empty]" },
    { labelKey: "tools.playground.iconHungerBuff", preview: ["food-buff-hunger"], template: "[icon:food-buff-hunger]" },
    { labelKey: "tools.playground.iconSaturationBuff", preview: ["food-buff-saturation"], template: "[icon:food-buff-saturation]" },
  ],
};
const mediaPresets: MediaPreset[] = [
  { fields: ["bilibili", "youtube"], id: "bilibili-youtube", labelKey: "tools.playground.mediaBilibiliYoutube", template: "[vedio:bilibili:{{bilibili}};youtube:{{youtube}}]" },
  { fields: ["bilibili"], id: "bilibili", labelKey: "tools.playground.mediaBilibili", template: "[vedio:bilibili:{{bilibili}}]" },
  { fields: ["youtube"], id: "youtube", labelKey: "tools.playground.mediaYoutube", template: "[vedio:youtube:{{youtube}}]" },
  { fields: ["geogebra"], id: "geogebra", labelKey: "tools.playground.mediaGeogebra", template: "[GeoGebra:{{geogebra}}]" },
];

export function ToolsPlayground({ documentId, embedded = false, editorDescription, editorTitle, onBusyChange, onChange, uploadSource = "playground", value }: ToolsPlaygroundProps = {}) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blueprintInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const previewPositionFrameRef = useRef<number | null>(null);
  const drawioFrameRef = useRef<HTMLIFrameElement | null>(null);
  const onChangeRef = useRef(onChange);
  const onBusyChangeRef = useRef(onBusyChange);
  const uploadingRef = useRef(false);
  const draftSaveSessionIDRef = useRef("");
  const draftSaveCoordinatorRef = useRef(createMarkdownDraftSaveCoordinator(0));
  const draftSaveAbortRef = useRef<AbortController | null>(null);
  const lastPersistedMarkdownRef = useRef<string | null>(null);
  const [markdown, setMarkdown] = useState(() => value ?? t("tools.playground.defaultMarkdown"));
  const markdownRef = useRef(markdown);
  const controlledSessionRef = useRef(createMarkdownEditorSession(documentId ?? "", markdown));
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [rendererConfig, setRendererConfig] = useState<MarkdownRendererConfig>(defaultMarkdownConfig);
  const [editorMessage, setEditorMessage] = useState("");
  const [drawioSession, setDrawioSession] = useState<DrawioEditSession | null>(null);
  const [mediaInsertSession, setMediaInsertSession] = useState<MediaInsertSession | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(embedded);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [draftConflict, setDraftConflict] = useState<MarkdownDraftConflict | null>(null);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const [draftLoadRetry, setDraftLoadRetry] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const activeDrawioFence = findDrawioFence(markdown, cursorPosition, cursorPosition);

  const replaceMarkdownState = useCallback((nextMarkdown: string) => {
    markdownRef.current = nextMarkdown;
    setMarkdown(nextMarkdown);
  }, []);

  const commitMarkdown = useCallback((nextValue: string | ((current: string) => string)) => {
    const nextMarkdown = typeof nextValue === "function" ? nextValue(markdownRef.current) : nextValue;
    markdownRef.current = nextMarkdown;
    if (embedded) controlledSessionRef.current = editMarkdownEditorSession(controlledSessionRef.current, nextMarkdown);
    setMarkdown(nextMarkdown);
    if (embedded) onChangeRef.current?.(nextMarkdown);
  }, [embedded]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);

  useEffect(() => {
    if (!embedded) return;
    const previousSession = controlledSessionRef.current;
    const nextSession = synchronizeMarkdownEditorSession(previousSession, documentId ?? "", value ?? "");
    const documentChanged = previousSession.documentId !== nextSession.documentId;
    controlledSessionRef.current = nextSession;
    if (markdownRef.current !== nextSession.markdown) replaceMarkdownState(nextSession.markdown);
    if (documentChanged) {
      setCursorPosition(0);
      setDrawioSession(null);
      setMediaInsertSession(null);
    }
  }, [documentId, embedded, replaceMarkdownState, value]);

  useEffect(() => () => {
    if (previewPositionFrameRef.current !== null) window.cancelAnimationFrame(previewPositionFrameRef.current);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function exitOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", exitOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", exitOnEscape);
    };
  }, [isFullscreen]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<MarkdownRendererConfig>("/api/v1/markdown/config")
      .then((config) => {
        if (!cancelled) setRendererConfig(normalizeMarkdownConfig(config));
      })
      .catch(() => {
        if (!cancelled) setRendererConfig(defaultMarkdownConfig);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (embedded) return;
    let cancelled = false;
    const loadController = new AbortController();
    draftSaveAbortRef.current?.abort();
    draftSaveAbortRef.current = null;
    draftSaveCoordinatorRef.current = createMarkdownDraftSaveCoordinator(0);
    draftSaveSessionIDRef.current = globalThis.crypto?.randomUUID?.() ?? `markdown-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    lastPersistedMarkdownRef.current = null;
    queueMicrotask(() => {
      if (!cancelled) {
        setDraftConflict(null);
        setDraftLoadFailed(false);
        setSaving(false);
        setDraftLoaded(false);
      }
    });
    if (!token) {
      const localDraft = window.localStorage.getItem("mcmods-markdown-playground-draft");
      queueMicrotask(() => {
        if (cancelled) return;
        if (localDraft !== null) {
          replaceMarkdownState(localDraft);
          lastPersistedMarkdownRef.current = localDraft;
        }
        setDraftLoaded(true);
      });
      return () => {
        cancelled = true;
        loadController.abort();
      };
    }
    apiRequest<{ content: string; revision: number; updatedAt?: string | null }>("/api/v1/users/me/markdown-playground", { signal: loadController.signal }, token)
      .then((draft) => {
        if (cancelled) return;
        draftSaveCoordinatorRef.current = createMarkdownDraftSaveCoordinator(draft.revision);
        if (draft.revision > 0) {
          replaceMarkdownState(draft.content);
          lastPersistedMarkdownRef.current = draft.content;
        }
        if (draft.updatedAt) setSavedAt(draft.updatedAt);
        setDraftLoadFailed(false);
        setDraftLoaded(true);
      })
      .catch((error) => {
        if (!cancelled && !isRequestAbort(error)) {
          setEditorMessage(cleanPlaygroundError(error, t("tools.playground.operationFailed")));
          setDraftLoadFailed(true);
          setDraftLoaded(false);
        }
      });
    return () => {
      cancelled = true;
      loadController.abort();
      draftSaveAbortRef.current?.abort();
    };
  }, [draftLoadRetry, embedded, replaceMarkdownState, t, token]);

  const saveDraft = useCallback(async () => {
    if (embedded) return;
    if (!draftLoaded) return;
    const requestedMarkdown = markdownRef.current;
    if (!token) {
      window.localStorage.setItem("mcmods-markdown-playground-draft", requestedMarkdown);
      lastPersistedMarkdownRef.current = requestedMarkdown;
      setEditorMessage(t("tools.playground.savedLocal"));
      return;
    }
    const issued = issueMarkdownDraftSave(draftSaveCoordinatorRef.current, draftSaveSessionIDRef.current, requestedMarkdown);
    draftSaveCoordinatorRef.current = issued.coordinator;
    draftSaveAbortRef.current?.abort();
    const saveController = new AbortController();
    draftSaveAbortRef.current = saveController;
    setSaving(true);
    try {
      const result = await apiRequest<{ clientSequence: number; revision: number; updatedAt: string }>(
        "/api/v1/users/me/markdown-playground",
        { method: "PUT", body: JSON.stringify(issued.request), signal: saveController.signal },
        token,
      );
      const applied = applyMarkdownDraftSaveResult(draftSaveCoordinatorRef.current, result);
      draftSaveCoordinatorRef.current = applied.coordinator;
      if (!applied.isLatest || markdownRef.current !== requestedMarkdown) return;
      lastPersistedMarkdownRef.current = requestedMarkdown;
      setSavedAt(result.updatedAt);
      setDraftConflict(null);
      setEditorMessage(t("tools.playground.saved"));
    } catch (error) {
      if (isRequestAbort(error)) return;
      if (issued.request.clientSequence !== draftSaveCoordinatorRef.current.latestIssuedSequence) return;
      if (error instanceof ApiError && error.status === 409 && error.code === "MARKDOWN_DRAFT_CONFLICT") {
        const conflict = parseMarkdownDraftConflict(error.details);
        if (conflict && conflict.clientSequence === issued.request.clientSequence) {
          const applied = applyMarkdownDraftSaveResult(draftSaveCoordinatorRef.current, conflict);
          draftSaveCoordinatorRef.current = applied.coordinator;
          setDraftConflict(conflict);
          setEditorMessage(t("tools.playground.draftConflict"));
          return;
        }
      }
      setEditorMessage(cleanPlaygroundError(error, t("tools.playground.operationFailed")));
    } finally {
      if (issued.request.clientSequence === draftSaveCoordinatorRef.current.latestIssuedSequence) {
        if (draftSaveAbortRef.current === saveController) draftSaveAbortRef.current = null;
        setSaving(false);
      }
    }
  }, [draftLoaded, embedded, t, token]);

  useEffect(() => {
    if (embedded) return;
    if (!draftLoaded) return;
    if (draftConflict) return;
    if (lastPersistedMarkdownRef.current === markdown) return;
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [draftConflict, draftLoaded, embedded, markdown, saveDraft]);

  const keepLocalDraft = useCallback(() => {
    if (!draftConflict) return;
    draftSaveCoordinatorRef.current = rebaseMarkdownDraftSaveCoordinator(draftSaveCoordinatorRef.current, draftConflict.revision);
    setDraftConflict(null);
    void saveDraft();
  }, [draftConflict, saveDraft]);

  const useServerDraft = useCallback(() => {
    if (!draftConflict) return;
    draftSaveAbortRef.current?.abort();
    draftSaveCoordinatorRef.current = rebaseMarkdownDraftSaveCoordinator(draftSaveCoordinatorRef.current, draftConflict.revision);
    replaceMarkdownState(draftConflict.content);
    lastPersistedMarkdownRef.current = draftConflict.content;
    if (draftConflict.updatedAt) setSavedAt(draftConflict.updatedAt);
    setDraftConflict(null);
    setSaving(false);
    setEditorMessage(t("tools.playground.serverDraftLoaded"));
  }, [draftConflict, replaceMarkdownState, t]);

  const replaceSelection = useCallback((nextValue: string, selectionStart: number, selectionEnd: number) => {
    commitMarkdown(nextValue);
    setCursorPosition(selectionStart);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }, [commitMarkdown]);

  const closeDrawioEditor = useCallback(() => {
    setDrawioSession(null);
  }, []);

  useEffect(() => {
    if (!drawioSession?.open) return;
    // Capture the validated session for the asynchronous message handler.
    const activeSession = drawioSession;

    function receiveMessage(event: MessageEvent<unknown>) {
      if (event.origin !== DRAWIO_ORIGIN) return;
      const message = parseDrawioMessage<DrawioEditorMessage>(event.data);
      if (!message) return;
      if (message.event === "init") {
        drawioFrameRef.current?.contentWindow?.postMessage(
          JSON.stringify({
            action: "load",
            autosave: 0,
            modified: 0,
            saveAndExit: 1,
            noExitBtn: 0,
            title: t("tools.playground.drawioModalTitle"),
            xml: activeSession.xml || defaultDrawioXml,
          }),
          DRAWIO_ORIGIN,
        );
        return;
      }
      if (message.event === "save" && message.xml) {
        const block = `\n\`\`\`drawio\n${message.xml.trim()}\n\`\`\`\n`;
        const nextMarkdown = markdown.slice(0, activeSession.replaceStart) + block + markdown.slice(activeSession.replaceEnd);
        const cursor = activeSession.replaceStart + block.length;
        replaceSelection(nextMarkdown, cursor, cursor);
        setEditorMessage(t("tools.playground.drawioSavedBack"));
        setDrawioSession(message.exit ? null : { ...activeSession, xml: message.xml, replaceEnd: activeSession.replaceStart + block.length });
      }
      if (message.event === "exit") {
        closeDrawioEditor();
      }
      if (message.error) setEditorMessage(message.error);
    }

    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [closeDrawioEditor, drawioSession, markdown, replaceSelection, t]);

  function applyCommand(command: MarkdownCommand) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = markdown.slice(start, end);
    const before = markdown.slice(0, start);
    const after = markdown.slice(end);
    const lineStart = markdown.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const blockStart = markdown.slice(0, lineStart);
    const blockRest = markdown.slice(lineStart);
    const selectedLines = selected || currentLine(markdown, start);

    if (command === "bold") return wrapSelection("**", "**", t("tools.playground.sampleBold"));
    if (command === "italic") return wrapSelection("*", "*", t("tools.playground.sampleItalic"));
    if (command === "strike") return wrapSelection("~~", "~~", t("tools.playground.sampleStrike"));
    if (command === "inlineCode") return wrapSelection("`", "`", t("tools.playground.sampleCode"));
    if (command === "quote") return insertLinePrefix("> ");
    if (command === "unorderedList") return insertLinePrefix("- ");
    if (command === "orderedList") {
      const lines = selectedLines.split("\n");
      const replacement = lines.map((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`).join("\n");
      return replaceSelection(blockStart + replacement + blockRest.slice(selectedLines.length), lineStart, lineStart + replacement.length);
    }
    if (command === "codeBlock") {
      const fallback = selected || "console.log(\"mcmods\");";
      const insertion = `\n\`\`\`js\n${fallback}\n\`\`\`\n`;
      return replaceSelection(before + insertion + after, start + 7, start + 7 + fallback.length);
    }
    if (command === "table") {
      const insertion = `\n| ${t("tools.playground.tableName")} | ${t("tools.playground.tableDescription")} |\n| --- | --- |\n| ${t("tools.playground.tableExample")} | ${t("tools.playground.tableContent")} |\n`;
      return replaceSelection(before + insertion + after, start + insertion.length, start + insertion.length);
    }
    if (command === "divider") {
      const insertion = "\n---\n";
      return replaceSelection(before + insertion + after, start + insertion.length, start + insertion.length);
    }

    function wrapSelection(left: string, right: string, fallback: string) {
      const text = selected || fallback;
      const insertion = `${left}${text}${right}`;
      replaceSelection(before + insertion + after, start + left.length, start + left.length + text.length);
    }

    function insertLinePrefix(prefix: string) {
      const lines = selectedLines.split("\n");
      const replacement = lines.map((line) => `${prefix}${line.replace(/^(\s*>|- )/, "")}`).join("\n");
      replaceSelection(blockStart + replacement + blockRest.slice(selectedLines.length), lineStart, lineStart + replacement.length);
    }
  }

  function applyHeading(event: ChangeEvent<HTMLSelectElement>) {
    const level = Number(event.target.value);
    event.target.value = "";
    if (!level) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = markdown.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEnd = markdown.indexOf("\n", start);
    const end = lineEnd === -1 ? markdown.length : lineEnd;
    const line = markdown.slice(lineStart, end).replace(/^#{1,6}\s+/, "");
    const replacement = `${"#".repeat(level)} ${line || t("tools.playground.headingPlaceholder")}`;
    replaceSelection(markdown.slice(0, lineStart) + replacement + markdown.slice(end), lineStart + level + 1, lineStart + replacement.length);
  }

  function openDrawioEditor() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const range = findDrawioFence(markdown, textarea.selectionStart, textarea.selectionEnd);
    setDrawioSession({
      open: true,
      xml: range?.xml || defaultDrawioXml,
      replaceStart: range?.start ?? textarea.selectionStart,
      replaceEnd: range?.end ?? textarea.selectionEnd,
    });
    setEditorMessage(t(range ? "tools.playground.drawioEditing" : "tools.playground.drawioCreating"));
  }

  function editDrawioFence(range: { start: number; end: number; xml: string }) {
    setDrawioSession({ open: true, xml: range.xml, replaceStart: range.start, replaceEnd: range.end });
    setEditorMessage(t("tools.playground.drawioEditing"));
  }

  function revealPreviewAtCursor(editor: HTMLTextAreaElement, pointerViewportY?: number) {
    setCursorPosition(editor.selectionStart);
    const preview = previewRef.current;
    if (!preview) return;
    const sourceLine = editor.value.slice(0, editor.selectionStart).split("\n").length;
    if (previewPositionFrameRef.current !== null) window.cancelAnimationFrame(previewPositionFrameRef.current);
    previewPositionFrameRef.current = window.requestAnimationFrame(() => {
      previewPositionFrameRef.current = null;
      const candidates = Array.from(preview.querySelectorAll<HTMLElement>("[data-source-start-line]"))
        .map((element) => ({
          depth: elementDepthWithin(element, preview),
          element,
          end: Number(element.dataset.sourceEndLine || element.dataset.sourceStartLine),
          start: Number(element.dataset.sourceStartLine),
        }))
        .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end));
      const containing = candidates
        .filter((item) => item.start <= sourceLine && item.end >= sourceLine)
        .sort((left, right) => (left.end - left.start) - (right.end - right.start) || right.depth - left.depth);
      const target = containing[0] ?? candidates
        .filter((item) => item.start <= sourceLine)
        .sort((left, right) => right.start - left.start || right.depth - left.depth)[0] ?? candidates[0];
      if (!target) return;

      const editorRect = editor.getBoundingClientRect();
      const targetRect = target.element.getBoundingClientRect();
      const targetLineCount = Math.max(1, target.end - target.start + 1);
      const targetLineProgress = Math.min(1, Math.max(0, (sourceLine - target.start + 0.5) / targetLineCount));
      const targetViewportY = targetRect.top + targetRect.height * targetLineProgress;
      const desiredViewportY = Number.isFinite(pointerViewportY)
        ? Math.min(editorRect.bottom, Math.max(editorRect.top, pointerViewportY as number))
        : estimateTextareaCaretViewportY(editor, sourceLine, editorRect);
      const top = preview.scrollTop + targetViewportY - desiredViewportY;
      preview.scrollTo({ top: Math.max(0, top) });
    });
  }

  function insertIconSyntax(template: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? markdown.length;
    const end = textarea?.selectionEnd ?? markdown.length;
    const selected = markdown.slice(start, end).trim();
    const selectedValue = /^-?\d+(?:\.\d+)?$/.test(selected) ? selected : "";
    const value = selectedValue || "3";
    const snippet = template.replace("{{value}}", value);
    const nextMarkdown = markdown.slice(0, start) + snippet + markdown.slice(end);
    const valueStartInSnippet = snippet.indexOf(value);
    if (template.includes("{{value}}") && !selectedValue && valueStartInSnippet >= 0) {
      const selectionStart = start + valueStartInSnippet;
      replaceSelection(nextMarkdown, selectionStart, selectionStart + value.length);
      return;
    }
    replaceSelection(nextMarkdown, start + snippet.length, start + snippet.length);
  }

  function openMediaDialog(preset: MediaPreset) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? markdown.length;
    const end = textarea?.selectionEnd ?? markdown.length;
    setMediaInsertSession({ end, initialValue: markdown.slice(start, end).trim(), preset, start });
  }

  function insertMediaSyntax(values: Record<MediaField, string>) {
    if (!mediaInsertSession) return;
    const snippet = mediaInsertSession.preset.fields.reduce(
      (result, field) => result.replace(`{{${field}}}`, values[field].trim()),
      mediaInsertSession.preset.template,
    );
    const nextMarkdown = markdown.slice(0, mediaInsertSession.start) + snippet + markdown.slice(mediaInsertSession.end);
    const cursor = mediaInsertSession.start + snippet.length;
    setMediaInsertSession(null);
    replaceSelection(nextMarkdown, cursor, cursor);
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0 || uploadingRef.current) return;
    if (!token) {
      setEditorMessage(t("tools.playground.loginBeforeUpload"));
      return;
    }
    const placeholders = insertUploadPlaceholders(files);
    uploadingRef.current = true;
    setUploading(true);
    onBusyChangeRef.current?.(true);
    setEditorMessage(t("tools.playground.uploadingFiles", { count: files.length }));
    let failed = 0;
    try {
      for (const [index, file] of files.entries()) {
        const marker = placeholders[index];
        try {
          const record = await uploadUserFileToOSS(file, token, uploadSource);
          if (isBlueprintFile(file)) {
            const publicId = record.blueprintId || record.blueprint?.id;
            if (!publicId) throw new Error(t("tools.playground.blueprintMissingId"));
            replaceMarkdownSnippet(marker, `[Bluemap:${publicId}]`);
          } else {
            if (!record.id) throw new Error(t("tools.playground.uploadMissingUrl"));
            replaceMarkdownSnippet(marker, markdownForUploadedFile(file, `/api/v1/oss/files/${encodeURIComponent(record.id)}/content`));
          }
        } catch (error) {
          failed += 1;
          replaceMarkdownSnippet(marker, `<!-- Upload failed "${safeUploadCommentName(file.name)}": ${cleanPlaygroundError(error, t("tools.playground.operationFailed"))} -->`);
        }
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      onBusyChangeRef.current?.(false);
    }
    setEditorMessage(failed > 0 ? t("tools.playground.uploadFailedCount", { count: failed }) : t("tools.playground.uploadInserted"));
  }

  function insertUploadPlaceholders(files: File[]) {
    const markers = files.map((file, index) => {
      const suffix = files.length > 1 ? ` #${index + 1}` : "";
      return `<!-- Uploading "${safeUploadCommentName(file.name)}"${suffix}... -->`;
    });
    insertMarkdownSnippet(`\n${markers.join("\n\n")}\n`);
    return markers;
  }

  function insertMarkdownSnippet(snippet: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? markdown.length;
    const end = textarea?.selectionEnd ?? markdown.length;
    const nextMarkdown = markdown.slice(0, start) + snippet + markdown.slice(end);
    replaceSelection(nextMarkdown, start + snippet.length, start + snippet.length);
  }

  function replaceMarkdownSnippet(marker: string, replacement: string) {
    commitMarkdown((current) => current.replace(marker, replacement));
  }
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
  }

  const viewModeSwitch = (
    <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1 md:hidden">
      {(["edit", "preview"] as const).map((mode) => (
        <button
          key={mode}
          className={`focus-ring rounded-md px-4 py-2 text-sm font-bold ${
            viewMode === mode ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
          }`}
          type="button"
          onClick={() => setViewMode(mode)}
        >
          {t(mode === "edit" ? "tools.playground.edit" : "tools.playground.preview")}
        </button>
      ))}
    </div>
  );

  return (
    <main
      className={isFullscreen
        ? "fixed inset-0 z-[70] h-dvh min-h-0 overflow-hidden bg-[var(--background)] text-[var(--foreground)]"
        : embedded
          ? "h-[min(70dvh,52rem)] min-h-[36rem] overflow-hidden bg-[var(--background)] text-[var(--foreground)]"
          : "min-h-screen bg-[var(--background)] text-[var(--foreground)] md:h-[calc(100dvh-4.5rem)] md:min-h-0 md:overflow-hidden"}
    >
      <section className={`mx-auto flex h-full flex-col ${isFullscreen ? "max-w-none p-3 md:p-4" : embedded ? "max-w-none" : "max-w-7xl px-4 py-6"}`}>
        <div className={`flex shrink-0 flex-wrap justify-between gap-3 ${isFullscreen ? "mb-3 items-center" : "mb-4 items-end"}`}>
          <div className={isFullscreen ? "min-w-0" : undefined}>
            {!isFullscreen && !embedded ? <p className="text-sm font-semibold text-[var(--accent)]">{t("tools.playground.kicker")}</p> : null}
            {!embedded || isFullscreen || editorTitle ? <h1 className={`${isFullscreen ? "truncate text-lg" : "text-2xl"} font-bold`}>{editorTitle || t("tools.playground.title")}</h1> : null}
            {!isFullscreen && editorDescription ? <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--muted)]">{editorDescription}</p> : null}
            {!isFullscreen && !embedded ? (
              <>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("tools.playground.description")}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{t("tools.playground.uploadHint")}</p>
                {savedAt ? <p className="mt-1 text-xs text-[var(--muted)]">{t("tools.playground.lastSavedAt", { time: new Date(savedAt).toLocaleString() })}</p> : null}
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!embedded ? <button className="button-primary focus-ring" disabled={!draftLoaded || saving || uploading || Boolean(draftConflict)} type="button" onClick={() => void saveDraft()}>
              {saving ? t("tools.playground.saving") : uploading ? t("tools.playground.uploading") : t("common.save")}
            </button> : null}
            <button
              aria-pressed={isFullscreen}
              className="button-secondary focus-ring"
              type="button"
              onClick={() => setIsFullscreen((current) => !current)}
            >
              {t(isFullscreen ? "tools.playground.exitFullscreen" : "tools.playground.enterFullscreen")}
            </button>
          </div>
          <div className="w-full md:hidden">{viewModeSwitch}</div>
        </div>

        {!embedded && draftConflict ? <section className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--warning)] bg-[var(--panel)] p-3" role="alert">
          <p className="text-sm font-bold">{t("tools.playground.draftConflict")}</p>
          <div className="flex gap-2">
            <button className="button-secondary focus-ring" type="button" onClick={useServerDraft}>{t("tools.playground.useServerDraft")}</button>
            <button className="button-primary focus-ring" type="button" onClick={keepLocalDraft}>{t("tools.playground.keepLocalDraft")}</button>
          </div>
        </section> : null}

        {!embedded && token && draftLoadFailed ? <section className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--red)] bg-[var(--panel)] p-3" role="alert">
          <p className="text-sm font-bold">{t("tools.playground.draftLoadFailed")}</p>
          <button className="button-secondary focus-ring" type="button" onClick={() => setDraftLoadRetry((current) => current + 1)}>{t("tools.playground.retryDraftLoad")}</button>
        </section> : null}

        <div className={`grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-2 ${isFullscreen ? "min-h-0 flex-1" : "min-h-[28rem]"}`}>
          <section
            className={`${viewMode === "preview" ? "hidden md:flex" : "flex"} surface flex-col overflow-hidden rounded-lg [contain:layout_paint] md:min-h-0 ${isFullscreen ? "min-h-0" : "min-h-[28rem]"}`}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h2 className="font-bold">{t("tools.playground.editorTitle")}</h2>
              <span className="text-xs font-semibold text-[var(--muted)]">
                {t("tools.playground.charCount", { count: markdown.length })}
              </span>
            </div>
            <MarkdownToolbar
              message={editorMessage}
              onCommand={applyCommand}
              onHeading={applyHeading}
              onInsertDrawio={openDrawioEditor}
              onInsertIcon={insertIconSyntax}
              onInsertMedia={openMediaDialog}
              onUploadBlueprint={() => blueprintInputRef.current?.click()}
            />
            <div className="flex items-center border-b border-[var(--line)] px-3 py-2">
              <StickerPicker inputRef={textareaRef} value={markdown} onChange={commitMarkdown} />
            </div>
            <input
              ref={blueprintInputRef}
              className="hidden"
              type="file"
              accept=".nbt,.schem,.schematic,.litematic"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void uploadFiles(files);
              }}
            />
            {activeDrawioFence ? (
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-2 text-sm">
                <span className="truncate font-mono text-xs text-[var(--muted)]">
                  {t("tools.playground.drawioSourceLine", { line: markdown.slice(0, activeDrawioFence.start).split("\n").length })}
                </span>
                <button className="button-secondary focus-ring shrink-0" type="button" onClick={() => editDrawioFence(activeDrawioFence)}>
                  {t("tools.playground.editDiagram")}
                </button>
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 outline-none"
              spellCheck={false}
              value={markdown}
              onChange={(event) => { commitMarkdown(event.target.value); revealPreviewAtCursor(event.currentTarget); }}
              onClick={(event) => revealPreviewAtCursor(event.currentTarget, event.clientY)}
              onKeyUp={(event) => revealPreviewAtCursor(event.currentTarget)}
              onSelect={(event) => revealPreviewAtCursor(event.currentTarget)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onPaste={handlePaste}
            />
          </section>

          <section
            className={`${viewMode === "edit" ? "hidden md:flex" : "flex"} surface flex-col overflow-hidden rounded-lg [contain:layout_paint] md:min-h-0 ${isFullscreen ? "min-h-0" : "min-h-[28rem]"}`}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h2 className="font-bold">{t("tools.playground.previewTitle")}</h2>
              <span className="text-xs font-semibold text-[var(--muted)]">{t("tools.playground.safeRender")}</span>
            </div>
            <article ref={previewRef} className="markdown-preview min-h-0 flex-1 overflow-auto p-4">
              <MarkdownRenderer config={rendererConfig} emptyText={t("tools.playground.empty")} markdown={markdown} />
            </article>
          </section>
        </div>
      </section>
      {drawioSession?.open ? (
        <DrawioModal
          frameRef={drawioFrameRef}
          src={drawioEditorUrl()}
          title={t("tools.playground.drawioModalTitle")}
        />
      ) : null}
      {mediaInsertSession ? (
        <MediaInsertModal
          key={mediaInsertSession.preset.id}
          initialValue={mediaInsertSession.initialValue}
          preset={mediaInsertSession.preset}
          onCancel={() => setMediaInsertSession(null)}
          onInsert={insertMediaSyntax}
        />
      ) : null}
    </main>
  );
}

function elementDepthWithin(element: HTMLElement, container: HTMLElement) {
  let depth = 0;
  let current: HTMLElement | null = element;
  while (current && current !== container) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

function estimateTextareaCaretViewportY(editor: HTMLTextAreaElement, sourceLine: number, editorRect: DOMRect) {
  const style = window.getComputedStyle(editor);
  const lineHeight = Number.parseFloat(style.lineHeight) || 24;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const lineCenter = editorRect.top + paddingTop + (sourceLine - 0.5) * lineHeight - editor.scrollTop;
  return Math.min(
    editorRect.bottom - paddingBottom - lineHeight / 2,
    Math.max(editorRect.top + paddingTop + lineHeight / 2, lineCenter),
  );
}

function MarkdownToolbar({
  message,
  onCommand,
  onHeading,
  onInsertDrawio,
  onInsertIcon,
  onInsertMedia,
  onUploadBlueprint,
}: {
  message: string;
  onCommand: (command: MarkdownCommand) => void;
  onHeading: (event: ChangeEvent<HTMLSelectElement>) => void;
  onInsertDrawio: () => void;
  onInsertIcon: (template: string) => void;
  onInsertMedia: (preset: MediaPreset) => void;
  onUploadBlueprint: () => void;
}) {
  const { t } = useI18n();
  const buttons: Array<{ command: MarkdownCommand; label: string; title: string }> = [
    { command: "bold", label: "B", title: t("tools.playground.toolbarBold") },
    { command: "italic", label: "I", title: t("tools.playground.toolbarItalic") },
    { command: "strike", label: "S", title: t("tools.playground.toolbarStrike") },
    { command: "quote", label: ">", title: t("tools.playground.toolbarQuote") },
    { command: "unorderedList", label: "-", title: t("tools.playground.toolbarList") },
    { command: "orderedList", label: "1.", title: t("tools.playground.toolbarOrderedList") },
    { command: "inlineCode", label: "<>", title: t("tools.playground.toolbarInlineCode") },
    { command: "codeBlock", label: "{ }", title: t("tools.playground.toolbarCodeBlock") },
    { command: "table", label: "Table", title: t("tools.playground.toolbarTable") },
    { command: "divider", label: "---", title: t("tools.playground.toolbarDivider") },
  ];

  return (
    <div className="border-b border-[var(--line)] bg-[var(--accent)] text-white">
      <div className="flex flex-wrap items-center gap-px">
        {buttons.slice(0, 3).map((button) => (
          <ToolbarButton key={button.command} label={button.label} title={button.title} onClick={() => onCommand(button.command)} />
        ))}
        <select
          aria-label={t("tools.playground.toolbarHeading")}
          className="h-11 border-0 bg-[rgba(255,255,255,0.12)] px-3 text-sm font-bold text-white outline-none"
          defaultValue=""
          title={t("tools.playground.toolbarHeading")}
          onChange={onHeading}
        >
          <option className="text-black" value="">
            H#
          </option>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <option key={level} className="text-black" value={level}>
              H{level} {t(`tools.playground.heading${level}`)}
            </option>
          ))}
        </select>
        {buttons.slice(3).map((button) => (
          <ToolbarButton key={button.command} label={button.label} title={button.title} onClick={() => onCommand(button.command)} />
        ))}
        <IconSyntaxSelect onInsertIcon={onInsertIcon} />
        <MediaSyntaxSelect onInsertMedia={onInsertMedia} />
        <ToolbarButton label="IO" title={t("tools.playground.toolbarDrawio")} onClick={onInsertDrawio} />
        <ToolbarButton label="BL" title={t("tools.playground.toolbarBlueprint")} onClick={onUploadBlueprint} />
        {message ? <span className="px-3 text-xs font-semibold text-white/85">{message}</span> : null}
      </div>
    </div>
  );
}

function MediaSyntaxSelect({ onInsertMedia }: { onInsertMedia: (preset: MediaPreset) => void }) {
  const { t } = useI18n();
  return (
    <select
      aria-label={t("tools.playground.toolbarMedia")}
      className="h-11 border-0 bg-[rgba(255,255,255,0.12)] px-3 text-sm font-bold text-white outline-none"
      defaultValue=""
      title={t("tools.playground.toolbarMedia")}
      onChange={(event) => {
        const preset = mediaPresets.find((item) => item.id === event.target.value);
        event.target.value = "";
        if (preset) onInsertMedia(preset);
      }}
    >
      <option className="text-black" value="">
        {t("tools.playground.mediaMenu")}
      </option>
      {mediaPresets.map((preset) => (
        <option key={preset.id} className="text-black" value={preset.id}>
          {t(preset.labelKey)}
        </option>
      ))}
    </select>
  );
}

function IconSyntaxSelect({ onInsertIcon }: { onInsertIcon: (template: string) => void }) {
  const { t } = useI18n();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function insert(template: string) {
    if (detailsRef.current) detailsRef.current.open = false;
    onInsertIcon(template);
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        className="flex h-11 cursor-pointer list-none items-center bg-[rgba(255,255,255,0.12)] px-3 text-sm font-bold text-white hover:bg-[rgba(255,255,255,0.18)]"
        title={t("tools.playground.toolbarIcon")}
      >
        {t("tools.playground.iconMenu")}
      </summary>
      <div className="absolute left-0 top-full z-40 max-h-[min(32rem,70vh)] w-72 overflow-y-auto rounded-b-lg border border-[var(--line)] bg-[var(--panel)] p-2 text-[var(--foreground)] shadow-xl">
        <IconPresetGroup label={t("tools.playground.adaptiveIcons")} presets={iconPresets.adaptive} onInsert={insert} />
        <IconPresetGroup label={t("tools.playground.singleIcons")} presets={iconPresets.single} onInsert={insert} />
      </div>
    </details>
  );
}

function IconPresetGroup({
  label,
  onInsert,
  presets,
}: {
  label: string;
  onInsert: (template: string) => void;
  presets: Array<{ labelKey: string; preview: string[]; template: string }>;
}) {
  const { t } = useI18n();
  return (
    <section className="mb-2 last:mb-0">
      <h3 className="px-2 py-1.5 text-xs font-bold text-[var(--muted)]">{label}</h3>
      {presets.map((preset) => (
        <button
          key={preset.template}
          className="focus-ring flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--panel-subtle)]"
          type="button"
          onClick={() => onInsert(preset.template)}
        >
          <span className="flex w-14 shrink-0 items-center justify-center gap-0.5" aria-hidden="true">
            {preset.preview.map((name) => (
              <Image key={name} unoptimized alt="" className="[image-rendering:pixelated]" height={22} src={`/mc-icons/icon-${name}.svg`} width={22} />
            ))}
          </span>
          <span>{t(preset.labelKey)}</span>
        </button>
      ))}
    </section>
  );
}

function ToolbarButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      className="h-11 min-w-11 px-3 text-sm font-black hover:bg-[rgba(255,255,255,0.12)]"
      title={title}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MediaInsertModal({
  initialValue,
  onCancel,
  onInsert,
  preset,
}: {
  initialValue: string;
  onCancel: () => void;
  onInsert: (values: Record<MediaField, string>) => void;
  preset: MediaPreset;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<MediaField, string>>(() => ({
    bilibili: preset.fields[0] === "bilibili" ? initialValue : "",
    geogebra: preset.fields[0] === "geogebra" ? initialValue : "",
    youtube: preset.fields[0] === "youtube" ? initialValue : "",
  }));
  const canInsert = preset.fields.every((field) => values[field].trim());

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canInsert) onInsert(values);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={onCancel}>
      <form
        className="surface w-full max-w-xl rounded-lg border border-[var(--line)] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-insert-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="media-insert-title" className="text-lg font-bold">
          {t("tools.playground.mediaDialogTitle", { type: t(preset.labelKey) })}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("tools.playground.mediaDialogHint")}</p>
        <div className="mt-5 space-y-4">
          {preset.fields.map((field, index) => (
            <label key={field} className="block">
              <span className="mb-1.5 block text-sm font-bold">{t(`tools.playground.mediaField${capitalize(field)}`)}</span>
              <input
                autoFocus={index === 0}
                className="input focus-ring w-full"
                placeholder={t(`tools.playground.mediaPlaceholder${capitalize(field)}`)}
                value={values[field]}
                onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="button-secondary focus-ring" type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="button-primary focus-ring" disabled={!canInsert} type="submit">
            {t("tools.playground.insertMedia")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function isBlueprintFile(file: File) {
  return /\.(?:nbt|schem|schematic|litematic)$/i.test(file.name);
}

function DrawioModal({
  frameRef,
  src,
  title,
}: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  src: string;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-white">
      <iframe
        ref={frameRef}
        className="h-screen w-screen border-0 bg-white"
        src={src}
        title={title}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
      />
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function currentLine(value: string, index: number) {
  const start = value.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const end = value.indexOf("\n", index);
  return value.slice(start, end === -1 ? value.length : end);
}

function drawioEditorUrl() {
  const params = new URLSearchParams({
    embed: "1",
    proto: "json",
    spin: "1",
    libraries: "1",
    saveAndExit: "1",
    noExitBtn: "0",
    ui: "atlas",
    lang: "zh",
  });
  return `${DRAWIO_ORIGIN}/?${params.toString()}`;
}

function findDrawioFence(markdown: string, selectionStart: number, selectionEnd: number) {
  const fencePattern = /```drawio\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(markdown))) {
    const start = match.index;
    const end = match.index + match[0].length;
    const cursorInside = selectionStart >= start && selectionStart <= end;
    const selectionOverlaps = selectionStart <= end && selectionEnd >= start;
    if (cursorInside || selectionOverlaps) {
      return { start, end, xml: match[1].trim() };
    }
  }
  return null;
}

function cleanPlaygroundError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

function isRequestAbort(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function safeUploadCommentName(name: string) {
  return (name || "file").replaceAll("--", "- -").replaceAll("\n", " ").replaceAll("\r", " ");
}
