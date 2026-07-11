"use client";

/* eslint-disable @next/next/no-img-element */
import GithubSlugger from "github-slugger";
import plantumlEncoder from "plantuml-encoder";
import { isValidElement, ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkDirective from "remark-directive";
import remarkEmoji from "remark-emoji";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import type { PluggableList } from "unified";
import { apiRequest } from "../_lib/api";
import { DRAWIO_ORIGIN, parseDrawioMessage } from "../_lib/drawio";
import { useI18n } from "../_lib/i18n-provider";
import { MarkdownRendererConfig, normalizeMarkdownConfig } from "../_lib/markdown-config";
import { IconFont } from "./iconfont";

type MarkdownRendererProps = {
  markdown: string;
  config?: Partial<MarkdownRendererConfig>;
  emptyText: string;
};

type TocItem = {
  depth: number;
  id: string;
  text: string;
};

type HastNode = Element | Text | { type: string };

type Root = {
  type: "root";
  children: HastNode[];
};

type Parent = {
  children: HastNode[];
  tagName?: string;
};

type SourcePositionNode = {
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
};

type Text = {
  type: "text";
  value: string;
};

type Element = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
};

type MdastNode = {
  type: string;
  name?: string;
  label?: string;
  value?: string;
  data?: Record<string, unknown>;
  children?: MdastNode[];
};

type MdastParent = {
  children: MdastNode[];
};

const visitTree = visit as unknown as (
  tree: Root,
  test: "element" | "text",
  visitor: (node: Element | Text, index?: number, parent?: Parent) => void,
) => void;

const visitMarkdownTree = visit as unknown as (
  tree: MdastNode,
  test: string,
  visitor: (node: MdastNode, index?: number, parent?: MdastParent) => void,
) => void;

const iconSyntaxPattern = /\[icon:([a-zA-Z0-9_-]+)(?:=([^\],]+))?(?:,([^\]]+))?\]/g;
const videoSyntaxPattern = /\[(?:vedio|video):([^\]]+)]/gi;
const geogebraSyntaxPattern = /\[GeoGebra:([^\]]+)]/gi;
const timeSyntaxPattern = /\[time:utc[+-]\d{1,2}(?::?\d{2})?;\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}]/gi;
const iconMarkerStart = "\uE000MCICON_";
const videoMarkerStart = "\uE000MCVIDEO_";
const geogebraMarkerStart = "\uE000MCGEOGEBRA_";
const timeMarkerStart = "\uE000MCTIME_";
const customMarkerEnd = "\uE001";
let mainlandChinaRequest: Promise<boolean> | null = null;

export function MarkdownRenderer({ markdown, config, emptyText }: MarkdownRendererProps) {
  const { t } = useI18n();
  const [isMainlandChina, setIsMainlandChina] = useState(true);
  const normalized = normalizeMarkdownConfig(config);
  const source = normalized.expandTabs ? markdown.replaceAll("\t", " ".repeat(normalized.tabSize)) : markdown;
  const abbreviations = normalized.abbreviations ? extractAbbreviations(source) : new Map<string, string>();
  const tocItems = normalized.toc ? extractToc(source, normalized) : [];
  const remarkPlugins = [
    normalized.enhancedTables || normalized.taskLists || normalized.footnotes ? remarkGfm : null,
    normalized.collapsibleBlocks ? remarkDirective : null,
    normalized.collapsibleBlocks ? () => remarkDetailsDirective() : null,
    normalized.emoji ? remarkEmoji : null,
    normalized.katex ? remarkMath : null,
  ].filter(Boolean) as PluggableList;
  const rehypePlugins = [
    normalized.katex ? [rehypeKatex, { output: "mathml" }] : null,
    normalized.codeHighlight ? rehypeHighlight : null,
    () => rehypeMcmodsExtensions(normalized, abbreviations, isMainlandChina),
  ].filter(Boolean) as PluggableList;

  useEffect(() => {
    let cancelled = false;
    if (!mainlandChinaRequest) {
      mainlandChinaRequest = apiRequest<{ isMainlandChina: boolean }>("/api/v1/location")
        .then((location) => location.isMainlandChina)
        .catch(() => {
          mainlandChinaRequest = null;
          return true;
        });
    }
    void mainlandChinaRequest.then((value) => {
      if (!cancelled) setIsMainlandChina(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!source.trim()) return <p className="text-[var(--muted)]">{emptyText}</p>;

  return (
    <div className="markdown-preview-grid">
      {tocItems.length > 0 ? (
        <nav className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm">
          <p className="mb-2 font-bold">{t("tools.playground.tableOfContents")}</p>
          <ol className="space-y-1">
            {tocItems.map((item) => (
              <li key={item.id} style={{ paddingLeft: `${Math.max(0, item.depth - normalized.tocMinDepth) * 16}px` }}>
                <a className="text-[var(--accent)] underline-offset-4 hover:underline" href={`#${item.id}`}>
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <MarkdownBody markdown={protectCustomSyntax(stripAbbreviationDefinitions(source))} rehypePlugins={rehypePlugins} remarkPlugins={remarkPlugins} />
    </div>
  );
}

function MarkdownBody({
  markdown,
  rehypePlugins,
  remarkPlugins,
}: {
  markdown: string;
  rehypePlugins: PluggableList;
  remarkPlugins: PluggableList;
}) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ node, ...props }) => <h1 {...props} {...sourceLineAttributes(node)} />,
        h2: ({ node, ...props }) => <h2 {...props} {...sourceLineAttributes(node)} />,
        h3: ({ node, ...props }) => <h3 {...props} {...sourceLineAttributes(node)} />,
        h4: ({ node, ...props }) => <h4 {...props} {...sourceLineAttributes(node)} />,
        h5: ({ node, ...props }) => <h5 {...props} {...sourceLineAttributes(node)} />,
        h6: ({ node, ...props }) => <h6 {...props} {...sourceLineAttributes(node)} />,
        p: ({ node, ...props }) => <p {...props} {...sourceLineAttributes(node)} />,
        ul: ({ node, ...props }) => <ul {...props} {...sourceLineAttributes(node)} />,
        ol: ({ node, ...props }) => <ol {...props} {...sourceLineAttributes(node)} />,
        li: ({ node, ...props }) => <li {...props} {...sourceLineAttributes(node)} />,
        blockquote: ({ node, ...props }) => <blockquote {...props} {...sourceLineAttributes(node)} />,
        a: ({ href, children }) =>
          isSafeHref(href) ? (
            <a
              className="font-semibold text-[var(--accent)] underline underline-offset-4"
              href={href}
              rel="noreferrer"
              target={href?.startsWith("http") ? "_blank" : undefined}
            >
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
        table: ({ node, children }) => <table {...sourceLineAttributes(node)} className="w-full min-w-96 text-left text-sm">{children}</table>,
        th: ({ children }) => <th className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2">{children}</th>,
        td: ({ children }) => <td className="border-b border-[var(--line)] px-3 py-2">{children}</td>,
        pre: ({ children }) => <>{children}</>,
        time: ({ dateTime, className, children }) =>
          String(className ?? "").includes("markdown-local-time") && dateTime ? (
            <LocalizedMarkdownTime fallback={reactNodeToText(children)} instant={dateTime} />
          ) : (
            <time className={className} dateTime={dateTime}>{children}</time>
          ),
        span: ({ className, children }) =>
          String(className ?? "").includes("markdown-geogebra-embed") ? (
            <GeoGebraZoomEmbed>{children}</GeoGebraZoomEmbed>
          ) : <span className={className}>{children}</span>,
        code: ({ node, className, children }) => {
          const language = /language-(\S+)/.exec(className ?? "")?.[1] ?? "";
          const code = reactNodeToText(children).replace(/\n$/, "");
          if (!language) return <code>{children}</code>;
          const sourcePosition = sourceLineAttributes(node);
          if (language.toLowerCase() === "drawio") return <DrawioDiagramPreview sourcePosition={sourcePosition} xml={code} />;
          return (
            <CopyableCodeBlock code={code} language={language} sourcePosition={sourcePosition}>
              {children}
            </CopyableCodeBlock>
          );
        },
        img: ({ src, alt, width, height, className }) => {
          const safeSrc = typeof src === "string" ? src : "";
          const isMcIcon = safeSrc.startsWith("/mc-icons/") || String(className ?? "").includes("mc-icon-image");
          if (isMcIcon) {
            return isSafeHref(safeSrc) ? (
              <img alt={typeof alt === "string" ? alt : ""} className="mc-icon-image" src={safeSrc} />
            ) : null;
          }
          return isSafeHref(safeSrc) ? (
            <img
              alt={typeof alt === "string" ? alt : ""}
              className="max-w-full rounded-lg border border-[var(--line)]"
              height={typeof height === "number" || typeof height === "string" ? height : undefined}
              src={safeSrc}
              width={typeof width === "number" || typeof width === "string" ? width : undefined}
            />
          ) : null;
        },
      }}
      rehypePlugins={rehypePlugins}
      remarkPlugins={remarkPlugins}
      skipHtml
    >
      {markdown}
    </ReactMarkdown>
  );
}

function sourceLineAttributes(node?: SourcePositionNode) {
  const startLine = node?.position?.start?.line;
  const endLine = node?.position?.end?.line;
  return {
    ...(typeof startLine === "number" ? { "data-source-start-line": startLine } : {}),
    ...(typeof endLine === "number" ? { "data-source-end-line": endLine } : {}),
  };
}

function DrawioDiagramPreview({ xml, sourcePosition }: { xml: string; sourcePosition: ReturnType<typeof sourceLineAttributes> }) {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [imageSrc, setImageSrc] = useState("");

  useEffect(() => {
    function receiveMessage(event: MessageEvent<unknown>) {
      if (event.origin !== DRAWIO_ORIGIN) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = parseDrawioMessage<{ data?: string; event?: string }>(event.data);
      if (message?.event === "init") {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({
            action: "export",
            bg: "#ffffff",
            border: 0,
            format: "svg",
            xml,
          }),
          DRAWIO_ORIGIN,
        );
      }
      if (message?.event === "export" && message.data) {
        setImageSrc(drawioExportToImageSrc(message.data));
      }
    }

    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [xml]);

  return (
    <figure {...sourcePosition} className="drawio-preview">
      {imageSrc ? (
        <img alt={t("tools.playground.diagramPreviewAlt")} src={imageSrc} />
      ) : (
        <span className="drawio-preview-loading">{t("tools.playground.diagramLoading")}</span>
      )}
      <iframe key={xml} ref={iframeRef} src={drawioPreviewUrl()} title="draw.io diagram exporter" />
    </figure>
  );
}

function GeoGebraZoomEmbed({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [expandedViewport, setExpandedViewport] = useState({ height: 900, width: 1600 });
  const src = findIframeSource(children);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const updateViewport = () => setExpandedViewport(geoGebraViewport());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    updateViewport();
    document.body.style.overflow = "hidden";
    window.addEventListener("resize", updateViewport);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  return (
    <>
      <span className="markdown-embed markdown-geogebra-embed">
        {children}
        {src ? <button className="button-secondary focus-ring geogebra-expand-button" title={t("tools.playground.expandGeoGebra")} type="button" onClick={() => { setExpandedViewport(geoGebraViewport()); setExpanded(true); }}><IconFont name="expand" fallback={t("tools.playground.expandGeoGebra")} /></button> : null}
      </span>
      {expanded && src ? createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={t("tools.playground.geogebraExpanded")} onMouseDown={() => setExpanded(false)}>
          <section className="flex h-[min(92vh,1200px)] w-full flex-col overflow-hidden rounded-lg bg-[var(--panel)] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3"><h2 className="font-bold">{t("tools.playground.geogebraExpanded")}</h2><button className="button-secondary focus-ring" type="button" onClick={() => setExpanded(false)}>{t("common.close")}</button></header>
            <iframe className="min-h-0 w-full flex-1 border-0" allowFullScreen src={geoGebraSourceForViewport(src, expandedViewport)} title={t("tools.playground.geogebraExpanded")} />
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function geoGebraViewport() {
  if (typeof window === "undefined") return { height: 900, width: 1600 };
  return {
    height: Math.max(540, Math.floor(window.innerHeight * 0.88) - 72),
    width: Math.max(960, Math.floor(window.innerWidth - 48)),
  };
}

function geoGebraSourceForViewport(src: string, viewport: { height: number; width: number }) {
  const interactiveSource = src
    .replace(/\/width\/\d+\/height\/\d+/, `/width/${viewport.width}/height/${viewport.height}`)
    .replace("/rc/false", "/rc/true")
    .replace("/sdz/false", "/sdz/true")
    .replace(/\/at\/[^/?#]+/, "/at/preferred");
  if (interactiveSource.includes("/szb/")) {
    return interactiveSource.replace(/\/szb\/(?:true|false)/, "/szb/true");
  }
  return interactiveSource.replace("/smb/", "/szb/true/smb/");
}

function findIframeSource(node: ReactNode): string {
  if (Array.isArray(node)) {
    for (const child of node) {
      const src = findIframeSource(child);
      if (src) return src;
    }
    return "";
  }
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode; src?: unknown };
  if (node.type === "iframe" && typeof props.src === "string") return props.src;
  return findIframeSource(props.children);
}

function drawioPreviewUrl() {
  const params = new URLSearchParams({
    embed: "1",
    proto: "json",
    spin: "1",
    libraries: "0",
    noExitBtn: "1",
    noSaveBtn: "1",
    saveAndExit: "0",
    chrome: "0",
    ui: "min",
  });
  return `${DRAWIO_ORIGIN}/?${params.toString()}`;
}

function drawioExportToImageSrc(data: string) {
  const trimmed = data.trim();
  if (trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  return trimmed;
}

function CopyableCodeBlock({ children, code, language, sourcePosition }: { children: ReactNode; code: string; language: string; sourcePosition: ReturnType<typeof sourceLineAttributes> }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <figure {...sourcePosition} className="markdown-codeblock">
      <figcaption>
        <span>{language}</span>
        <button className="focus-ring" type="button" onClick={copyCode}>
          {copied ? t("tools.playground.codeCopied") : t("tools.playground.copyCode")}
        </button>
      </figcaption>
      <pre>
        <code className={`language-${language}`}>{children}</code>
      </pre>
    </figure>
  );
}

function reactNodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return reactNodeToText(props.children);
  }
  return "";
}

function remarkDetailsDirective() {
  return (tree: MdastNode) => {
    visitMarkdownTree(tree, "containerDirective", (node) => {
      if (node.name !== "details") return;
      const title = node.label || "Details";
      node.data = { ...(node.data ?? {}), hName: "details", hProperties: { className: ["markdown-details"] } };
      node.children = [
        {
          type: "paragraph",
          data: { hName: "summary", hProperties: { className: ["markdown-details-summary"] } },
          children: [{ type: "text", value: title }],
        },
        ...(node.children ?? []),
      ];
    });
  };
}

function rehypeMcmodsExtensions(config: MarkdownRendererConfig, abbreviations: Map<string, string>, isMainlandChina: boolean) {
  return (tree: Root) => {
    const slugger = new GithubSlugger();

    visitTree(tree, "element", (node) => {
      if (node.type !== "element") return;
      if (/^h[1-6]$/.test(node.tagName)) {
        node.properties = { ...node.properties, id: slugger.slug(textContent(node)) };
      }
      if (config.imageSize && node.tagName === "img") {
        applyImageSize(node);
      }
      if (config.alertBlocks && node.tagName === "blockquote") {
        applyAlertBlock(node);
      }
      if (config.plantUML && node.tagName === "pre") {
        applyPlantUML(node, config.plantUMLServer);
      }
    });

    visitTree(tree, "text", (node, index, parent) => {
      if (node.type !== "text") return;
      if (!parent || typeof index !== "number") return;
      if (["code", "pre", "annotation", "script", "style"].includes(parent.tagName ?? "")) return;
      const replacements = splitTextNode(node.value, config, abbreviations, isMainlandChina);
      if (replacements.length > 1 || replacements[0] !== node) {
        parent.children.splice(index, 1, ...replacements);
      }
    });
  };
}

function splitTextNode(value: string, config: MarkdownRendererConfig, abbreviations: Map<string, string>, isMainlandChina: boolean) {
  const nodes: Array<Text | Element> = [];
  const tokens = Array.from(abbreviations.keys()).sort((a, b) => b.length - a.length).map(escapeRegExp);
  const protectedIconPattern = `${escapeRegExp(iconMarkerStart)}([^${customMarkerEnd}]+)${escapeRegExp(customMarkerEnd)}`;
  const protectedVideoPattern = `${escapeRegExp(videoMarkerStart)}([^${customMarkerEnd}]+)${escapeRegExp(customMarkerEnd)}`;
  const protectedGeogebraPattern = `${escapeRegExp(geogebraMarkerStart)}([^${customMarkerEnd}]+)${escapeRegExp(customMarkerEnd)}`;
  const protectedTimePattern = `${escapeRegExp(timeMarkerStart)}([^${customMarkerEnd}]+)${escapeRegExp(customMarkerEnd)}`;
  const iconPattern = String.raw`\[icon:([a-zA-Z0-9_-]+)(?:=([^\],]+))?(?:,([^\]]+))?\]`;
  const videoPattern = String.raw`\[(?:vedio|video):([^\]]+)\]`;
  const geogebraPattern = String.raw`\[[Gg]eo[Gg]ebra:([^\]]+)\]`;
  const superscriptPattern = config.superscript ? String.raw`\^([^\^\s][^\^]*?)\^` : String.raw`(?!)`;
  const subscriptPattern = config.subscript ? String.raw`~([^~\s][^~]*?)~` : String.raw`(?!)`;
  const abbrPattern = tokens.length > 0 ? String.raw`\b(${tokens.join("|")})\b` : String.raw`(?!)`;
  const matcher = new RegExp(
    `${protectedIconPattern}|${protectedVideoPattern}|${protectedGeogebraPattern}|${protectedTimePattern}|${iconPattern}|${videoPattern}|${geogebraPattern}|${superscriptPattern}|${subscriptPattern}|${abbrPattern}`,
    "g",
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(value))) {
    if (match.index > lastIndex) nodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
    if (match[1]) {
      const token = decodeURIComponent(match[1]);
      const icon = parseIconSyntax(token);
      nodes.push(icon ? createIconNode(icon.name, icon.value, icon.unit) : { type: "text", value: token });
    } else if (match[2]) {
      const token = decodeURIComponent(match[2]);
      const video = createVideoEmbedNode(token, isMainlandChina);
      nodes.push(video ?? { type: "text", value: `[vedio:${token}]` });
    } else if (match[3]) {
      const token = decodeURIComponent(match[3]);
      const geogebra = createGeoGebraEmbedNode(token);
      nodes.push(geogebra ?? { type: "text", value: `[GeoGebra:${token}]` });
    } else if (match[4]) {
      const token = decodeURIComponent(match[4]);
      nodes.push(createTimeNode(token) ?? { type: "text", value: token });
    } else if (match[5]) nodes.push(createIconNode(match[5], match[6], match[7]));
    else if (match[8]) {
      const video = createVideoEmbedNode(match[8], isMainlandChina);
      nodes.push(video ?? { type: "text", value: match[0] });
    } else if (match[9]) {
      const geogebra = createGeoGebraEmbedNode(match[9]);
      nodes.push(geogebra ?? { type: "text", value: match[0] });
    } else if (match[10]) nodes.push({ type: "element", tagName: "sup", properties: {}, children: [{ type: "text", value: match[10] }] });
    else if (match[11]) nodes.push({ type: "element", tagName: "sub", properties: {}, children: [{ type: "text", value: match[11] }] });
    else if (match[12]) {
      nodes.push({
        type: "element",
        tagName: "abbr",
        properties: { title: abbreviations.get(match[12]) ?? "" },
        children: [{ type: "text", value: match[12] }],
      });
    }
    lastIndex = matcher.lastIndex;
  }
  if (lastIndex < value.length) nodes.push({ type: "text", value: value.slice(lastIndex) });
  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}

function protectCustomSyntax(markdown: string) {
  return markdown
    .replace(iconSyntaxPattern, (token) => `${iconMarkerStart}${encodeURIComponent(token)}${customMarkerEnd}`)
    .replace(videoSyntaxPattern, (_token, payload: string) => `${videoMarkerStart}${encodeURIComponent(payload)}${customMarkerEnd}`)
    .replace(geogebraSyntaxPattern, (_token, payload: string) => `${geogebraMarkerStart}${encodeURIComponent(payload)}${customMarkerEnd}`)
    .replace(timeSyntaxPattern, (token) => `${timeMarkerStart}${encodeURIComponent(token)}${customMarkerEnd}`);
}

function createTimeNode(token: string): Element | null {
  const match = /^\[time:utc([+-])(\d{1,2})(?::?(\d{2}))?;(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})]$/i.exec(token);
  if (!match) return null;
  const [, sign, hours, minutes = "0", year, month, day, hour, minute, second] = match;
  const offsetMinutes = (Number(hours) * 60 + Number(minutes)) * (sign === "+" ? 1 : -1);
  if (
    Number(hours) > 23 || Number(minutes) > 59 || Number(month) < 1 || Number(month) > 12 ||
    Number(day) < 1 || Number(day) > 31 || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
  ) return null;
  const wallClock = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (
    wallClock.getUTCFullYear() !== Number(year) || wallClock.getUTCMonth() !== Number(month) - 1 ||
    wallClock.getUTCDate() !== Number(day) || wallClock.getUTCHours() !== Number(hour) ||
    wallClock.getUTCMinutes() !== Number(minute) || wallClock.getUTCSeconds() !== Number(second)
  ) return null;
  const instant = new Date(wallClock.getTime() - offsetMinutes * 60_000);
  if (Number.isNaN(instant.getTime())) return null;
  return {
    type: "element",
    tagName: "time",
    properties: { className: ["markdown-local-time"], dateTime: instant.toISOString(), title: token },
    children: [{ type: "text", value: `${year}-${month}-${day} ${hour}:${minute}:${second} UTC${sign}${hours}${minutes === "0" ? "" : `:${minutes}`}` }],
  };
}

function LocalizedMarkdownTime({ fallback, instant }: { fallback: string; instant: string }) {
  const text = useSyncExternalStore(
    () => () => undefined,
    () => {
    const date = new Date(instant);
      if (Number.isNaN(date.getTime())) return fallback;
      return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
      hour12: false,
      }).format(date);
    },
    () => fallback,
  );
  return <time className="markdown-local-time" dateTime={instant} title={fallback}>{text}</time>;
}

function parseIconSyntax(token: string) {
  const match = /^\[icon:([a-zA-Z0-9_-]+)(?:=([^\],]+))?(?:,([^\]]+))?]$/.exec(token);
  if (!match) return null;
  return { name: match[1], value: match[2], unit: match[3] };
}

function createVideoEmbedNode(payload: string, isMainlandChina: boolean): Element | null {
  const embeds = parseVideoEmbeds(payload);
  if (embeds.length === 0) return null;
  const preferredProvider = isMainlandChina ? "bilibili" : "youtube";
  const embed = embeds.find((item) => item.provider === preferredProvider) ?? embeds[0];
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["markdown-video-embed-group"] },
    children: [{
      type: "element",
      tagName: "span",
      properties: { className: ["markdown-embed", "markdown-video-embed"] },
      children: [
        {
          type: "element",
          tagName: "iframe",
          properties: {
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
            allowFullScreen: true,
            loading: "lazy",
            referrerPolicy: "strict-origin-when-cross-origin",
            src: embed.src,
            title: embed.title,
          },
          children: [],
        },
      ],
    }],
  };
}

function parseVideoEmbeds(payload: string) {
  return payload
    .split(";")
    .map((part) => parseProviderPair(part))
    .filter((pair): pair is { provider: string; value: string } => Boolean(pair))
    .map((pair) => {
      const provider = normalizeVideoProvider(pair.provider);
      if (provider === "bilibili") {
        const id = extractBilibiliID(pair.value);
        if (!id) return null;
        const query = id.toLowerCase().startsWith("av") ? `aid=${encodeURIComponent(id.slice(2))}` : `bvid=${encodeURIComponent(id)}`;
        return { provider, src: `https://player.bilibili.com/player.html?${query}&page=1&high_quality=1&autoplay=0`, title: `Bilibili ${id}` };
      }
      if (provider === "youtube") {
        const id = extractYouTubeID(pair.value);
        if (!id) return null;
        return { provider, src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, title: `YouTube ${id}` };
      }
      return null;
    })
    .filter((embed): embed is { provider: string; src: string; title: string } => Boolean(embed));
}

function parseProviderPair(part: string) {
  const index = part.indexOf(":");
  if (index <= 0) return null;
  const provider = part.slice(0, index).trim();
  const value = part.slice(index + 1).trim();
  if (!provider || !value) return null;
  return { provider, value };
}

function normalizeVideoProvider(provider: string) {
  const value = provider.toLowerCase();
  if (value === "b" || value === "bili" || value === "bilibili") return "bilibili";
  if (value === "y" || value === "yt" || value === "youtube") return "youtube";
  return "";
}

function extractBilibiliID(input: string) {
  const value = input.trim();
  const bv = value.match(/BV[0-9A-Za-z]+/i)?.[0];
  if (bv) return bv;
  const av = value.match(/av(\d+)/i)?.[0];
  if (av) return av.toLowerCase();
  return null;
}

function extractYouTubeID(input: string) {
  const value = input.trim();
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return sanitizeYouTubeID(url.pathname.split("/").filter(Boolean)[0] ?? "");
    if (url.hostname.includes("youtube.com")) {
      const watchID = url.searchParams.get("v");
      if (watchID) return sanitizeYouTubeID(watchID);
      const segments = url.pathname.split("/").filter(Boolean);
      const markerIndex = segments.findIndex((segment) => ["embed", "shorts", "live"].includes(segment));
      if (markerIndex >= 0) return sanitizeYouTubeID(segments[markerIndex + 1] ?? "");
    }
  } catch {
    return sanitizeYouTubeID(value);
  }
  return sanitizeYouTubeID(value);
}

function sanitizeYouTubeID(value: string) {
  const id = value.trim();
  return /^[A-Za-z0-9_-]{6,32}$/.test(id) ? id : null;
}

function createGeoGebraEmbedNode(payload: string): Element | null {
  const id = extractGeoGebraID(payload);
  if (!id) return null;
  const src = `https://www.geogebra.org/material/iframe/id/${encodeURIComponent(id)}/width/960/height/540/border/888888/rc/false/ai/false/sdz/false/smb/false/stb/false/stbh/false/ld/false/sri/true/at/auto`;
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["markdown-embed", "markdown-geogebra-embed"] },
    children: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          allowFullScreen: true,
          loading: "lazy",
          referrerPolicy: "strict-origin-when-cross-origin",
          src,
          title: `GeoGebra ${id}`,
        },
        children: [],
      },
    ],
  };
}

function extractGeoGebraID(input: string) {
  const value = input.trim();
  try {
    const url = new URL(value);
    if (!url.hostname.includes("geogebra.org")) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const markerIndex = segments.findIndex((segment) => segment === "m" || segment === "classic");
    if (markerIndex >= 0) return sanitizeGeoGebraID(segments[markerIndex + 1] ?? "");
  } catch {
    return sanitizeGeoGebraID(value);
  }
  return sanitizeGeoGebraID(value);
}

function sanitizeGeoGebraID(value: string) {
  const id = value.trim();
  return /^[A-Za-z0-9_-]{4,64}$/.test(id) ? id : null;
}

function createIconNode(rawName: string, rawValue?: string, rawUnit?: string): Element {
  const name = normalizeIconName(rawName);
  const numericValue = rawValue === undefined ? null : Number(rawValue);
  if (numericValue !== null && Number.isFinite(numericValue)) {
    const icons = createAdaptiveIconNodes(name, numericValue);
    const unit = rawUnit?.trim();
    const children: HastNode[] = unit
      ? [
          { type: "text", value: `${rawValue}${unit} (` },
          { type: "element", tagName: "span", properties: { className: ["mc-icon-stack"] }, children: icons },
          { type: "text", value: ")" },
        ]
      : [{ type: "element", tagName: "span", properties: { className: ["mc-icon-stack"] }, children: icons }];

    return {
      type: "element",
      tagName: "span",
      properties: { className: ["mc-icon-token", "mc-icon-group"], title: `[icon:${rawName}=${rawValue}${unit ? `,${unit}` : ""}]` },
      children,
    };
  }

  return {
    type: "element",
    tagName: "span",
    properties: { className: ["mc-icon-token", "mc-icon-single"], title: `[icon:${rawName}]` },
    children: [createIconImageNode(name)],
  };
}

function createAdaptiveIconNodes(name: string, value: number): HastNode[] {
  const normalizedValue = Math.max(0, value);
  const iconCount = normalizedValue / 2;
  if (iconCount > 10) {
    return [
      createIconImageNode(resolveIconVariant(name, "full")),
      { type: "text", value: ` × ${formatIconCount(iconCount)}` },
    ];
  }
  const fullCount = Math.min(64, Math.floor(normalizedValue / 2));
  const hasHalf = normalizedValue - fullCount * 2 > 0;
  const nodes = Array.from({ length: fullCount }, () => createIconImageNode(resolveIconVariant(name, "full")));
  if (hasHalf) nodes.push(createIconImageNode(resolveIconVariant(name, "half")));
  return nodes;
}

function formatIconCount(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100).replace(/\.0+$/, "");
}

function createIconImageNode(name: string): Element {
  return {
    type: "element",
    tagName: "img",
    properties: {
      alt: name,
      className: ["mc-icon-image"],
      decoding: "async",
      loading: "lazy",
      src: `/mc-icons/icon-${name}.svg`,
    },
    children: [],
  };
}

function resolveIconVariant(name: string, variant: "full" | "half") {
  if (name === "health") return `health-${variant}`;
  if (name.startsWith("health-")) return `health-${variant}-${name.slice("health-".length)}`;
  if (name === "hunger-level") return `food-${variant}-hunger-level`;
  if (name === "saturation-level") return variant === "full" ? "food-empty-saturation-level-100" : "food-empty-saturation-level-50";
  if (name === "armor") return `armor-${variant}`;
  if (name === "toughness") return `toughness-${variant}`;
  if (name === "toughness-diamond") return `toughness-diamond-${variant}`;
  return `${name}-${variant}`;
}

function normalizeIconName(name: string) {
  return name.trim().replace(/^icon-/, "").replace(/\.svg$/i, "").toLowerCase();
}

function extractAbbreviations(markdown: string) {
  const map = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    const match = line.match(/^\*\[([^\]]+)]:\s+(.+)$/);
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

function stripAbbreviationDefinitions(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => !/^\*\[([^\]]+)]:\s+(.+)$/.test(line))
    .join("\n");
}

function extractToc(markdown: string, config: MarkdownRendererConfig): TocItem[] {
  const slugger = new GithubSlugger();
  return markdown
    .split("\n")
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ depth: match[1].length, text: match[2].replace(/[*_`~^]/g, "") }))
    .filter((item) => item.depth >= config.tocMinDepth && item.depth <= config.tocMaxDepth)
    .map((item) => ({ ...item, id: slugger.slug(item.text) }));
}

function applyImageSize(node: Element) {
  const alt = String(node.properties?.alt ?? "");
  const match = alt.match(/\s*=\s*(\d+)?x(\d+)?\s*$/);
  if (!match) return;
  node.properties = {
    ...node.properties,
    alt: alt.replace(/\s*=\s*(\d+)?x(\d+)?\s*$/, ""),
    width: match[1] ? Number(match[1]) : undefined,
    height: match[2] ? Number(match[2]) : undefined,
  };
}

function applyAlertBlock(node: Element) {
  const first = node.children[0];
  if (!isElement(first) || first.tagName !== "p") return;
  const firstText = textContent(first);
  const match = firstText.match(/^\[!(NOTE|TIP|WARNING|DANGER)]\s*/i);
  if (!match) return;
  node.properties = { ...node.properties, className: ["markdown-alert", `markdown-alert-${match[1].toLowerCase()}`] };
  removeLeadingText(first, match[0]);
}

function applyPlantUML(node: Element, server: string) {
  const code = node.children[0];
  if (!isElement(code) || code.tagName !== "code") return;
  const className = code.properties?.className;
  const classes = Array.isArray(className) ? className.map(String) : [];
  if (!classes.includes("language-plantuml")) return;
  node.tagName = "figure";
  node.properties = { className: ["plantuml-preview"] };
  node.children = [
    {
      type: "element",
      tagName: "img",
      properties: {
        alt: "PlantUML",
        src: `${server}/svg/${plantumlEncoder.encode(textContent(code))}`,
      },
      children: [],
    },
  ];
}

function removeLeadingText(node: Element, prefix: string) {
  const first = node.children[0];
  if (isText(first)) first.value = first.value.replace(prefix, "");
}

function textContent(node: Element | Text): string {
  if (node.type === "text") return node.value;
  return node.children.map((child) => (isText(child) || isElement(child) ? textContent(child) : "")).join("");
}

function isSafeHref(href?: string) {
  return Boolean(href && /^(https?:\/\/|\/(?!\/)|#)/i.test(href.trim()));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isElement(node: HastNode | undefined): node is Element {
  return Boolean(node && node.type === "element" && "tagName" in node);
}

function isText(node: HastNode | undefined): node is Text {
  return Boolean(node && node.type === "text" && "value" in node);
}
