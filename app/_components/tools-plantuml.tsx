"use client";

import plantumlEncoder from "plantuml-encoder";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";
import { PLANTUML_PROXY_PATH } from "../_lib/markdown-config";
import { useTheme } from "./theme-provider";

type ViewMode = "edit" | "preview";

export function ToolsPlantUML() {
  const { t } = useI18n();
  const { toggleTheme } = useTheme();
  const [source, setSource] = useState(() => t("tools.plantuml.defaultSource"));
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const previewUrl = useMemo(() => {
    const trimmed = source.trim();
    if (!trimmed) return "";
    return `${PLANTUML_PROXY_PATH}/svg/${plantumlEncoder.encode(trimmed)}`;
  }, [source]);

  async function copySource() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  function resetExample() {
    setSource(t("tools.plantuml.defaultSource"));
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-bold text-[var(--on-accent)]">
              M
            </span>
            <span>
              <span className="block text-xs font-semibold text-[var(--muted)]">{t("common.appName")}</span>
              <span className="block text-xl font-bold">{t("tools.title")}</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <Link className="button-secondary focus-ring" href="/tools">
              {t("tools.title")}
            </Link>
            <Link className="button-secondary focus-ring" href="/">
              {t("common.home")}
            </Link>
            <button className="button-secondary focus-ring" type="button" onClick={toggleTheme}>
              {t("common.toggleTheme")}
            </button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">{t("tools.plantuml.kicker")}</p>
            <h1 className="text-2xl font-bold">{t("tools.plantuml.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("tools.plantuml.description")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="button-secondary focus-ring" type="button" onClick={resetExample}>
              {t("tools.plantuml.reset")}
            </button>
            <button className="button-secondary focus-ring" type="button" onClick={copySource}>
              {copied ? t("tools.plantuml.copied") : t("tools.plantuml.copySource")}
            </button>
            {previewUrl ? (
              <a className="button-primary focus-ring" href={previewUrl} rel="noreferrer" target="_blank">
                {t("tools.plantuml.openSvg")}
              </a>
            ) : null}
          </div>
          <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1 md:hidden">
            {(["edit", "preview"] as const).map((mode) => (
              <button
                key={mode}
                className={`focus-ring rounded-md px-4 py-2 text-sm font-bold ${
                  viewMode === mode ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)]"
                }`}
                type="button"
                onClick={() => setViewMode(mode)}
              >
                {t(mode === "edit" ? "tools.plantuml.edit" : "tools.plantuml.preview")}
              </button>
            ))}
          </div>
        </div>

        {copyError ? <p role="alert" className="mb-4 text-sm font-bold text-[var(--red)]">{t("common.copyFailed")}</p> : null}
        <div className="grid min-h-[calc(100vh-15rem)] gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <section className={`${viewMode === "preview" ? "hidden md:flex" : "flex"} surface min-h-[28rem] flex-col rounded-lg`}>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h2 className="font-bold">{t("tools.plantuml.editorTitle")}</h2>
              <span className="text-xs font-semibold text-[var(--muted)]">{t("tools.plantuml.charCount", { count: source.length })}</span>
            </div>
            <textarea
              aria-label={t("tools.plantuml.editorTitle")}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 outline-none"
              spellCheck={false}
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </section>

          <section className={`${viewMode === "edit" ? "hidden md:flex" : "flex"} surface min-h-[28rem] flex-col rounded-lg`}>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h2 className="font-bold">{t("tools.plantuml.previewTitle")}</h2>
              <span className="text-xs font-semibold text-[var(--muted)]">{t("tools.plantuml.svgPreview")}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[var(--panel-subtle)] p-4">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={t("tools.plantuml.previewAlt")}
                  className="mx-auto max-w-full rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm"
                  src={previewUrl}
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">{t("tools.plantuml.empty")}</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
