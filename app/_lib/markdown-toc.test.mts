import assert from "node:assert/strict";
import test from "node:test";
import remarkEmoji from "remark-emoji";
import { extractMarkdownToc } from "./markdown-toc.mts";

test("TOC preserves duplicate IDs across excluded depths and ignores fenced examples", () => {
  const source = "# Repeated\n\n## Repeated\n\n```md\n## Repeated\n```\n\n### Repeated\n\nSetext title\n------------\n";
  assert.deepEqual(extractMarkdownToc(source, [], 2, 3), [
    { depth: 2, id: "repeated-1", text: "Repeated" },
    { depth: 3, id: "repeated-2", text: "Repeated" },
    { depth: 2, id: "setext-title", text: "Setext title" },
  ]);
});

test("TOC reads inline formatting and the renderer's remark emoji extension", () => {
  assert.deepEqual(extractMarkdownToc("## **Strong** [link](https://example.test) `code` :smile:\n", [remarkEmoji], 1, 6), [
    { depth: 2, id: "strong-link-code-", text: "Strong link code 😄" },
  ]);
});
