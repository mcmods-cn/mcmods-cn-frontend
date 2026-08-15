"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DRAWIO_ORIGIN, parseDrawioMessage, type DrawioEditorMessage } from "../_lib/drawio";
import { useI18n } from "../_lib/i18n-provider";
import { useTheme } from "./theme-provider";

const storageKey = "mcmods-drawio-draft";
const defaultDiagramXml =
  '<mxfile host="embed.diagrams.net"><diagram id="mcmods-page-1" name="Page 1"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

export function ToolsDrawio() {
  const { locale, t } = useI18n();
  const { toggleTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [diagramXml, setDiagramXml] = useState(() => {
    if (typeof window === "undefined") return defaultDiagramXml;
    return window.localStorage.getItem(storageKey) || defaultDiagramXml;
  });
  const [status, setStatus] = useState(t("tools.drawio.loading"));
  const [savedAt, setSavedAt] = useState("");
  const [copied, setCopied] = useState(false);
  const editorUrl = useMemo(() => {
    const params = new URLSearchParams({
      embed: "1",
      proto: "json",
      spin: "1",
      libraries: "1",
      saveAndExit: "1",
      noExitBtn: "1",
      ui: "atlas",
      lang: locale === "zh-CN" || locale === "zh-TW" ? "zh" : "en",
    });
    return `${DRAWIO_ORIGIN}/?${params.toString()}`;
  }, [locale]);

  const persistXml = useCallback(
    (xml: string, eventName: string) => {
      setDiagramXml(xml);
      window.localStorage.setItem(storageKey, xml);
      const time = new Date().toLocaleTimeString();
      setSavedAt(time);
      setStatus(eventName === "autosave" ? t("tools.drawio.autosaved") : t("tools.drawio.saved"));
    },
    [t],
  );

  useEffect(() => {
    function receiveMessage(event: MessageEvent<string>) {
      if (event.origin !== DRAWIO_ORIGIN) return;
      const message = parseDrawioMessage<DrawioEditorMessage>(event.data);
      if (!message) return;
      if (message.event === "init") {
        postToEditor({
          action: "load",
          autosave: 1,
          modified: 0,
          saveAndExit: 1,
          noExitBtn: 1,
          title: t("tools.drawio.documentTitle"),
          xml: diagramXml || defaultDiagramXml,
        });
        setStatus(t("tools.drawio.ready"));
        return;
      }
      if ((message.event === "save" || message.event === "autosave") && message.xml) {
        persistXml(message.xml, message.event);
        if (message.exit) setStatus(t("tools.drawio.saved"));
        return;
      }
      if (message.event === "exit") {
        setStatus(message.modified ? t("tools.drawio.exitModified") : t("tools.drawio.exit"));
        return;
      }
      if (message.error) {
        setStatus(message.error);
      }
    }

    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [diagramXml, persistXml, t]);

  function postToEditor(payload: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), DRAWIO_ORIGIN);
  }

  function requestSave() {
    postToEditor({ action: "save" });
  }

  function resetDiagram() {
    const confirmed = window.confirm(t("tools.drawio.resetConfirm"));
    if (!confirmed) return;
    window.localStorage.removeItem(storageKey);
    setDiagramXml(defaultDiagramXml);
    postToEditor({ action: "load", xml: defaultDiagramXml, title: t("tools.drawio.documentTitle"), autosave: 1 });
    setStatus(t("tools.drawio.resetDone"));
  }

  async function copyXml() {
    await navigator.clipboard.writeText(diagramXml);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function downloadXml() {
    const blob = new Blob([diagramXml], { type: "application/vnd.jgraph.mxfile+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mcmods-diagram.drawio";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-bold text-white">
              M
            </span>
            <span>
              <span className="block text-xs font-semibold text-[var(--muted)]">{t("common.appName")}</span>
              <span className="block text-xl font-bold">{t("tools.drawio.title")}</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <button className="button-primary focus-ring" type="button" onClick={requestSave}>
              {t("tools.drawio.save")}
            </button>
            <button className="button-secondary focus-ring" type="button" onClick={copyXml}>
              {copied ? t("tools.drawio.copied") : t("tools.drawio.copyXml")}
            </button>
            <button className="button-secondary focus-ring" type="button" onClick={downloadXml}>
              {t("tools.drawio.downloadXml")}
            </button>
            <button className="button-secondary focus-ring" type="button" onClick={resetDiagram}>
              {t("tools.drawio.reset")}
            </button>
            <Link className="button-secondary focus-ring" href="/tools">
              {t("tools.title")}
            </Link>
            <button className="button-secondary focus-ring" type="button" onClick={toggleTheme}>
              {t("common.toggleTheme")}
            </button>
          </nav>
        </div>
        <div className="border-t border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--muted)]">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-2">
            <span>{status}</span>
            <span>{savedAt ? t("tools.drawio.savedAt", { time: savedAt }) : t("tools.drawio.localDraft")}</span>
          </div>
        </div>
      </header>

      <section className="min-h-0 flex-1 bg-[#f5f6f7]">
        <iframe
          ref={iframeRef}
          className="h-[calc(100vh-7.75rem)] w-full border-0 bg-white"
          src={editorUrl}
          title={t("tools.drawio.title")}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
        />
      </section>
    </main>
  );
}
