import assert from "node:assert/strict";
import { test } from "node:test";
import { transformMarkdownOutsideCode } from "./markdown-code-boundaries.mts";

test("extension replacements preserve fenced, indented and inline code without hiding prose", () => {
  const token = "[icon:health=4]";
  const source = `${token}\n\n\`\`\`md\n${token}\n\`\`\`\n\n    ${token}\n\nInline \`\`${token} with a \`\`\` example\`\` and ${token}.\n`;
  const result = transformMarkdownOutsideCode(source, text => text.replaceAll(token, "EXTENSION"));
  assert.equal(result, source.replace(token, "EXTENSION").replace(`and ${token}.`, "and EXTENSION."));
});

test("tilde and unclosed fences retain literal custom references", () => {
  const source = "~~~\n[intro:privateid]\n~~~\n\n[recipe:publicid]\n\n```\n[recipe:privateid]\n";
  assert.equal(transformMarkdownOutsideCode(source, text => text.replaceAll("[recipe:", "REFERENCE:")), source.replace("[recipe:publicid]", "REFERENCE:publicid]"));
});
