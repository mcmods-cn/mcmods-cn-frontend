export type MarkdownRendererConfig = {
  core: boolean;
  abbreviations: boolean;
  emoji: boolean;
  footnotes: boolean;
  subscript: boolean;
  superscript: boolean;
  taskLists: boolean;
  katex: boolean;
  expandTabs: boolean;
  imageSize: boolean;
  plantUML: boolean;
  codeHighlight: boolean;
  enhancedTables: boolean;
  collapsibleBlocks: boolean;
  alertBlocks: boolean;
  toc: boolean;
  tabSize: number;
  plantUMLServer: string;
  tocMinDepth: number;
  tocMaxDepth: number;
};

export const PLANTUML_PROXY_PATH = "/plantuml";

export const defaultMarkdownConfig: MarkdownRendererConfig = {
  core: true,
  abbreviations: true,
  emoji: true,
  footnotes: true,
  subscript: true,
  superscript: true,
  taskLists: true,
  katex: true,
  expandTabs: true,
  imageSize: true,
  plantUML: false,
  codeHighlight: true,
  enhancedTables: true,
  collapsibleBlocks: true,
  alertBlocks: true,
  toc: true,
  tabSize: 2,
  plantUMLServer: PLANTUML_PROXY_PATH,
  tocMinDepth: 2,
  tocMaxDepth: 3,
};

export function normalizeMarkdownConfig(config?: Partial<MarkdownRendererConfig> | null): MarkdownRendererConfig {
  const plantUMLServerIsTrusted = isPlantUMLProxyPath(config?.plantUMLServer);
  return {
    ...defaultMarkdownConfig,
    ...(config ?? {}),
    tabSize: clampNumber(config?.tabSize, 1, 8, defaultMarkdownConfig.tabSize),
    tocMinDepth: clampNumber(config?.tocMinDepth, 1, 6, defaultMarkdownConfig.tocMinDepth),
    tocMaxDepth: clampNumber(config?.tocMaxDepth, 1, 6, defaultMarkdownConfig.tocMaxDepth),
    plantUML: Boolean(config?.plantUML ?? defaultMarkdownConfig.plantUML) && plantUMLServerIsTrusted,
    plantUMLServer: PLANTUML_PROXY_PATH,
  };
}

function isPlantUMLProxyPath(value: unknown) {
  const normalized = String(value ?? "").trim().replace(/\/+$/, "");
  return normalized === "" || normalized === PLANTUML_PROXY_PATH;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
