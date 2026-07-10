"use client";

import { ChangeEvent, ClipboardEvent, DragEvent, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { DRAWIO_ORIGIN, parseDrawioMessage } from "../_lib/drawio";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig, MarkdownRendererConfig, normalizeMarkdownConfig } from "../_lib/markdown-config";
import { markdownForUploadedFile, uploadUserFileToOSS } from "../_lib/oss-upload";
import { MarkdownRenderer } from "./markdown-renderer";

type ViewMode = "edit" | "preview";
type DrawioEditSession = {
  open: boolean;
  xml: string;
  replaceStart: number;
  replaceEnd: number;
};
type DrawioMessage = {
  event?: string;
  xml?: string;
  error?: string;
  exit?: boolean;
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

const defaultDrawioXml =
  '<mxfile host="embed.diagrams.net"><diagram id="mcmods-markdown-diagram" name="Page 1"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
const iconPresets = {
  adaptive: [
    { labelKey: "tools.playground.iconHealth", template: "[icon:health={{value}},点]" },
    { labelKey: "tools.playground.iconHealthEx", template: "[icon:health-ex={{value}},点]" },
    { labelKey: "tools.playground.iconHunger", template: "[icon:hunger-level={{value}},点]" },
    { labelKey: "tools.playground.iconSaturation", template: "[icon:saturation-level={{value}},点]" },
    { labelKey: "tools.playground.iconArmor", template: "[icon:armor={{value}},点]" },
    { labelKey: "tools.playground.iconToughness", template: "[icon:toughness={{value}},点]" },
    { labelKey: "tools.playground.iconToughnessDiamond", template: "[icon:toughness-diamond={{value}},点]" },
    { labelKey: "tools.playground.iconRegeneration", template: "[icon:health-buff-regeneration={{value}},点]" },
    { labelKey: "tools.playground.iconPoison", template: "[icon:health-buff-poison={{value}},点]" },
    { labelKey: "tools.playground.iconWither", template: "[icon:health-buff-wither={{value}},点]" },
    { labelKey: "tools.playground.iconJockey", template: "[icon:health-jockey={{value}},点]" },
  ],
  single: [
    { labelKey: "tools.playground.iconOxygenFull", template: "[icon:oxygen-full]" },
    { labelKey: "tools.playground.iconOxygenEmpty", template: "[icon:oxygen-empty]" },
    { labelKey: "tools.playground.iconExp", template: "[icon:exp]" },
    { labelKey: "tools.playground.iconArmorEmpty", template: "[icon:armor-empty]" },
    { labelKey: "tools.playground.iconHealthEmpty", template: "[icon:health-empty]" },
    { labelKey: "tools.playground.iconHungerBuff", template: "[icon:food-buff-hunger]" },
    { labelKey: "tools.playground.iconSaturationBuff", template: "[icon:food-buff-saturation]" },
  ],
};
const mediaPresets = [
  { labelKey: "tools.playground.mediaBilibiliYoutube", template: "[vedio:bilibili:{{bilibili}};youtube:{{youtube}}]" },
  { labelKey: "tools.playground.mediaBilibili", template: "[vedio:bilibili:{{bilibili}}]" },
  { labelKey: "tools.playground.mediaYoutube", template: "[vedio:youtube:{{youtube}}]" },
  { labelKey: "tools.playground.mediaGeogebra", template: "[GeoGebra:{{geogebra}}]" },
];
const mediaPlaceholderDefaults: Record<string, string> = {
  bilibili: "BV1hgM864E93",
  geogebra: "nnf7n93s",
  youtube: "6j6SyM8Ekwg",
};

export function ToolsPlayground() {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const drawioFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [markdown, setMarkdown] = useState(() => t("tools.playground.defaultMarkdown"));
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [rendererConfig, setRendererConfig] = useState<MarkdownRendererConfig>(defaultMarkdownConfig);
  const [editorMessage, setEditorMessage] = useState("");
  const [drawioSession, setDrawioSession] = useState<DrawioEditSession | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState("");

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
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setDraftLoaded(false);
    });
    if (!token) {
      const localDraft = window.localStorage.getItem("mcmods-markdown-playground-draft");
      queueMicrotask(() => {
        if (cancelled) return;
        if (localDraft) setMarkdown(localDraft);
        setDraftLoaded(true);
      });
      return () => {
        cancelled = true;
      };
    }
    apiRequest<{ content: string; updatedAt?: string | null }>("/api/v1/users/me/markdown-playground", {}, token)
      .then((draft) => {
        if (cancelled) return;
        if (draft.content) setMarkdown(draft.content);
        if (draft.updatedAt) setSavedAt(draft.updatedAt);
        setDraftLoaded(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setEditorMessage(cleanPlaygroundError(error, t("tools.playground.operationFailed")));
          setDraftLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t, token]);

  const saveDraft = useCallback(async () => {
    if (!draftLoaded) return;
    if (!token) {
      window.localStorage.setItem("mcmods-markdown-playground-draft", markdown);
      setEditorMessage(t("tools.playground.savedLocal"));
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ updatedAt: string }>(
        "/api/v1/users/me/markdown-playground",
        { method: "PUT", body: JSON.stringify({ content: markdown }) },
        token,
      );
      setSavedAt(result.updatedAt);
      setEditorMessage(t("tools.playground.saved"));
    } catch (error) {
      setEditorMessage(cleanPlaygroundError(error, t("tools.playground.operationFailed")));
    } finally {
      setSaving(false);
    }
  }, [draftLoaded, markdown, t, token]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      if (!token) {
        window.localStorage.setItem("mcmods-markdown-playground-draft", markdown);
        return;
      }
      void saveDraft();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [draftLoaded, markdown, saveDraft, token]);

  const replaceSelection = useCallback((nextValue: string, selectionStart: number, selectionEnd: number) => {
    setMarkdown(nextValue);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }, []);

  const closeDrawioEditor = useCallback(() => {
    setDrawioSession(null);
  }, []);

  useEffect(() => {
    const session = drawioSession;
    if (!session || !session.open) return;
    const activeSession = session;

    function receiveMessage(event: MessageEvent<unknown>) {
      if (event.origin !== DRAWIO_ORIGIN) return;
      const message = parseDrawioMessage<DrawioMessage>(event.data);
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

  function insertMediaSyntax(template: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? markdown.length;
    const end = textarea?.selectionEnd ?? markdown.length;
    const selected = markdown.slice(start, end).trim();
    const placeholders = Array.from(template.matchAll(/{{([a-z]+)}}/g)).map((match) => match[1]);
    let firstInsertedValue = "";
    const snippet = placeholders.reduce((result, placeholder, index) => {
      const value = index === 0 && selected ? selected : mediaPlaceholderDefaults[placeholder] ?? placeholder;
      if (index === 0) firstInsertedValue = value;
      return result.replace(`{{${placeholder}}}`, value);
    }, template);
    const nextMarkdown = markdown.slice(0, start) + snippet + markdown.slice(end);
    const selectionStart = firstInsertedValue ? start + snippet.indexOf(firstInsertedValue) : start + snippet.length;
    replaceSelection(nextMarkdown, selectionStart, selectionStart + firstInsertedValue.length);
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    if (!token) {
      setEditorMessage(t("tools.playground.loginBeforeUpload"));
      return;
    }
    const placeholders = insertUploadPlaceholders(files);
    setUploading(true);
    setEditorMessage(t("tools.playground.uploadingFiles", { count: files.length }));
    let failed = 0;
    for (const [index, file] of files.entries()) {
      const marker = placeholders[index];
      try {
        const record = await uploadUserFileToOSS(file, token, "playground");
        const url = record.accessUrl || record.url || "";
        if (!url) throw new Error(t("tools.playground.uploadMissingUrl"));
        replaceMarkdownSnippet(marker, markdownForUploadedFile(file, url));
      } catch (error) {
        failed += 1;
        replaceMarkdownSnippet(marker, `<!-- Upload failed "${safeUploadCommentName(file.name)}": ${cleanPlaygroundError(error, t("tools.playground.operationFailed"))} -->`);
      }
    }
    setUploading(false);
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
    setMarkdown((current) => current.replace(marker, replacement));
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

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">{t("tools.playground.kicker")}</p>
            <h1 className="text-2xl font-bold">{t("tools.playground.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {t("tools.playground.description")}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {t("tools.playground.uploadHint")}
            </p>
            {savedAt ? <p className="mt-1 text-xs text-[var(--muted)]">{t("tools.playground.lastSavedAt", { time: new Date(savedAt).toLocaleString() })}</p> : null}
          </div>
          <button className="button-primary focus-ring" disabled={saving || uploading} type="button" onClick={() => void saveDraft()}>
            {saving ? t("tools.playground.saving") : uploading ? t("tools.playground.uploading") : t("common.save")}
          </button>
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
        </div>

        <div className="grid min-h-[calc(100vh-15rem)] gap-4 md:grid-cols-2">
          <section
            className={`${viewMode === "preview" ? "hidden md:flex" : "flex"} surface min-h-[28rem] flex-col rounded-lg`}
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
              onInsertMedia={insertMediaSyntax}
            />
            <textarea
              ref={textareaRef}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 outline-none"
              spellCheck={false}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onPaste={handlePaste}
            />
          </section>

          <section
            className={`${viewMode === "edit" ? "hidden md:flex" : "flex"} surface min-h-[28rem] flex-col rounded-lg`}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h2 className="font-bold">{t("tools.playground.previewTitle")}</h2>
              <span className="text-xs font-semibold text-[var(--muted)]">{t("tools.playground.safeRender")}</span>
            </div>
            <article className="markdown-preview min-h-0 flex-1 overflow-auto p-4">
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
    </main>
  );
}

function MarkdownToolbar({
  message,
  onCommand,
  onHeading,
  onInsertDrawio,
  onInsertIcon,
  onInsertMedia,
}: {
  message: string;
  onCommand: (command: MarkdownCommand) => void;
  onHeading: (event: ChangeEvent<HTMLSelectElement>) => void;
  onInsertDrawio: () => void;
  onInsertIcon: (template: string) => void;
  onInsertMedia: (template: string) => void;
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
        {message ? <span className="px-3 text-xs font-semibold text-white/85">{message}</span> : null}
      </div>
    </div>
  );
}

function MediaSyntaxSelect({ onInsertMedia }: { onInsertMedia: (template: string) => void }) {
  const { t } = useI18n();
  return (
    <select
      aria-label={t("tools.playground.toolbarMedia")}
      className="h-11 border-0 bg-[rgba(255,255,255,0.12)] px-3 text-sm font-bold text-white outline-none"
      defaultValue=""
      title={t("tools.playground.toolbarMedia")}
      onChange={(event) => {
        const template = event.target.value;
        event.target.value = "";
        if (template) onInsertMedia(template);
      }}
    >
      <option className="text-black" value="">
        {t("tools.playground.mediaMenu")}
      </option>
      {mediaPresets.map((preset) => (
        <option key={preset.template} className="text-black" value={preset.template}>
          {t(preset.labelKey)}
        </option>
      ))}
    </select>
  );
}

function IconSyntaxSelect({ onInsertIcon }: { onInsertIcon: (template: string) => void }) {
  const { t } = useI18n();
  return (
    <select
      aria-label={t("tools.playground.toolbarIcon")}
      className="h-11 border-0 bg-[rgba(255,255,255,0.12)] px-3 text-sm font-bold text-white outline-none"
      defaultValue=""
      title={t("tools.playground.toolbarIcon")}
      onChange={(event) => {
        const template = event.target.value;
        event.target.value = "";
        if (template) onInsertIcon(template);
      }}
    >
      <option className="text-black" value="">
        {t("tools.playground.iconMenu")}
      </option>
      <optgroup className="text-black" label={t("tools.playground.adaptiveIcons")}>
        {iconPresets.adaptive.map((preset) => (
          <option key={preset.template} value={preset.template}>
            {t(preset.labelKey)}
          </option>
        ))}
      </optgroup>
      <optgroup className="text-black" label={t("tools.playground.singleIcons")}>
        {iconPresets.single.map((preset) => (
          <option key={preset.template} value={preset.template}>
            {t(preset.labelKey)}
          </option>
        ))}
      </optgroup>
    </select>
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
      <iframe ref={frameRef} className="h-screen w-screen border-0 bg-white" src={src} title={title} />
    </div>
  );
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

function safeUploadCommentName(name: string) {
  return (name || "file").replaceAll("--", "- -").replaceAll("\n", " ").replaceAll("\r", " ");
}
