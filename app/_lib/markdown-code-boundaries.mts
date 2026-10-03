import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// Extension syntax is prose. Code examples must remain exactly as authored,
// including CommonMark indented blocks and inline spans with multiple backticks.
export function transformMarkdownOutsideCode(source: string, transform: (text: string) => string): string {
  const ranges: Array<[number, number]> = [];
  const tree = unified().use(remarkParse).parse(source);
  visit(tree, (node) => {
    if (node.type !== "code" && node.type !== "inlineCode") return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (typeof start === "number" && typeof end === "number") ranges.push([start, end]);
  });
  ranges.sort((left, right) => left[0] - right[0]);
  let offset = 0;
  let result = "";
  for (const [start, end] of ranges) {
    if (start < offset) continue;
    result += transform(source.slice(offset, start)) + source.slice(start, end);
    offset = end;
  }
  return result + transform(source.slice(offset));
}
