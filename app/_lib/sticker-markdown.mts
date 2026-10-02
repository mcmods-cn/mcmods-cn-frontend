export type StickerMarkdownNode = {
  type: string;
  url?: string;
  alt?: string;
  title?: string;
  value?: string;
  data?: Record<string, unknown>;
  children?: StickerMarkdownNode[];
};

export type StickerMarkdownItem = {
  imageURL: string;
  name: string;
};

export function replaceStickerTokensInTree(
  tree: StickerMarkdownNode,
  resolve: (packCode: string, stickerCode: string) => StickerMarkdownItem | undefined,
  unavailableText = "[表情不可用]",
  maxTokens = 50,
) {
  let tokenCount = 0;
  replaceMarkdownTextNodes(tree, (value) => {
    if (tokenCount >= maxTokens) return null;
    const pattern = /\[sticker:([a-z0-9][a-z0-9_-]{0,47}):([a-z0-9][a-z0-9_-]{0,47})]/g;
    const children: StickerMarkdownNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while (tokenCount < maxTokens && (match = pattern.exec(value))) {
      if (match.index > lastIndex) children.push({ type: "text", value: value.slice(lastIndex, match.index) });
      const sticker = resolve(match[1], match[2]);
      if (sticker) {
        children.push({
          type: "image",
          url: sticker.imageURL,
          alt: sticker.name,
          title: sticker.name,
          data: { hProperties: { className: ["markdown-sticker"], title: sticker.name, loading: "lazy" } },
        });
      } else {
        children.push({ type: "text", value: unavailableText });
      }
      tokenCount += 1;
      lastIndex = pattern.lastIndex;
    }
    if (!children.length) return null;
    if (lastIndex < value.length) children.push({ type: "text", value: value.slice(lastIndex) });
    return children;
  });
  return tokenCount;
}

export function replaceMarkdownTextNodes(
  node: StickerMarkdownNode,
  replace: (value: string) => StickerMarkdownNode[] | null,
) {
  if (["link", "linkReference", "code", "inlineCode"].includes(node.type) || !node.children) return;
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child.type === "text" && typeof child.value === "string") {
      const replacement = replace(child.value);
      if (replacement) {
        node.children.splice(index, 1, ...replacement);
        index += replacement.length - 1;
      }
      continue;
    }
    replaceMarkdownTextNodes(child, replace);
  }
}
