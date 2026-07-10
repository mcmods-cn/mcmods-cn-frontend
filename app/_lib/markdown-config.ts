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
  plantUML: true,
  codeHighlight: true,
  enhancedTables: true,
  collapsibleBlocks: true,
  alertBlocks: true,
  toc: true,
  tabSize: 2,
  plantUMLServer: "https://www.plantuml.com/plantuml",
  tocMinDepth: 2,
  tocMaxDepth: 3,
};

export function normalizeMarkdownConfig(config?: Partial<MarkdownRendererConfig> | null): MarkdownRendererConfig {
  return {
    ...defaultMarkdownConfig,
    ...(config ?? {}),
    tabSize: clampNumber(config?.tabSize, 1, 8, defaultMarkdownConfig.tabSize),
    tocMinDepth: clampNumber(config?.tocMinDepth, 1, 6, defaultMarkdownConfig.tocMinDepth),
    tocMaxDepth: clampNumber(config?.tocMaxDepth, 1, 6, defaultMarkdownConfig.tocMaxDepth),
    plantUMLServer: String(config?.plantUMLServer || defaultMarkdownConfig.plantUMLServer).replace(/\/$/, ""),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
