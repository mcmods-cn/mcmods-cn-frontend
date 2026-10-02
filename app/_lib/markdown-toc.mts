import GithubSlugger from "github-slugger";
import remarkParse from "remark-parse";
import { unified, type PluggableList } from "unified";
import { restoreMarkdownMarkerLiterals } from "./markdown-markers.mts";

type TocNode = { type: string; depth?: number; value?: string; children?: TocNode[] };
export type MarkdownTocItem = { depth: number; id: string; text: string };

// Parse the same prepared document and remark extensions as the renderer.
// Slug all headings before filtering, so headings outside the TOC depth range
// still reserve their IDs exactly as they do in the rendered document.
export function extractMarkdownToc(markdown: string, plugins: PluggableList, minDepth: number, maxDepth: number): MarkdownTocItem[] {
  const processor = unified().use(remarkParse).use(plugins);
  const root = processor.runSync(processor.parse(markdown)) as unknown as TocNode;
  const slugger = new GithubSlugger();
  const result: MarkdownTocItem[] = [];
  function walk(node: TocNode) {
    if (node.type === "heading" && node.depth !== undefined) {
      const text = restoreMarkdownMarkerLiterals(headingText(node));
      const id = slugger.slug(text);
      if (node.depth >= minDepth && node.depth <= maxDepth) result.push({ depth: node.depth, id, text });
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(root);
  return result;
}

function headingText(node: TocNode): string {
  if (node.type === "image" || node.type === "imageReference") return "";
  if (node.value !== undefined) return node.value;
  return (node.children ?? []).map(headingText).join("");
}
