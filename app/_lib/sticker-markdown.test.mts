import assert from "node:assert/strict";
import test from "node:test";

import { replaceStickerTokensInTree, type StickerMarkdownNode } from "./sticker-markdown.mts";

test("renders text tokens but leaves code and links untouched", () => {
  const tree: StickerMarkdownNode = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: "Hello [sticker:animals:happy]" }] },
      { type: "inlineCode", value: "[sticker:animals:happy]" },
      { type: "code", value: "[sticker:animals:happy]" },
      { type: "link", url: "https://example.test", children: [{ type: "text", value: "[sticker:animals:happy]" }] },
      { type: "linkReference", children: [{ type: "text", value: "[sticker:animals:happy]" }] },
    ],
  };
  replaceStickerTokensInTree(tree, (packCode, stickerCode) => packCode === "animals" && stickerCode === "happy"
    ? { imageURL: "/happy.png", name: "Happy" }
    : undefined);

  const paragraph = tree.children?.[0];
  assert.deepEqual(paragraph?.children?.map((node) => node.type), ["text", "image"]);
  assert.equal(paragraph?.children?.[1]?.url, "/happy.png");
  for (const protectedNode of tree.children?.slice(1) ?? []) {
    const value = protectedNode.value ?? protectedNode.children?.[0]?.value;
    assert.equal(value, "[sticker:animals:happy]");
  }
});

test("uses a safe placeholder and enforces the per-document token budget", () => {
  const token = "[sticker:animals:missing]";
  const tree: StickerMarkdownNode = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: Array(51).fill(token).join(" ") }] }] };
  const count = replaceStickerTokensInTree(tree, () => undefined, "[unavailable]", 50);
  assert.equal(count, 50);
  const rendered = tree.children?.[0]?.children?.map((node) => node.value ?? "").join("") ?? "";
  assert.equal(rendered.split("[unavailable]").length - 1, 50);
  assert.match(rendered, /\[sticker:animals:missing]/);
});
