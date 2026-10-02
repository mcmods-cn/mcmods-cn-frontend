import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMarkdownEditorSession,
  editMarkdownEditorSession,
  synchronizeMarkdownEditorSession,
} from "./markdown-editor-session.mts";

test("multilingual Markdown sessions restore the selected document across A to B to A switches", () => {
  let session = createMarkdownEditorSession("locale:A", "body A");
  session = editMarkdownEditorSession(session, "draft A");
  session = synchronizeMarkdownEditorSession(session, "locale:A", "draft A");

  session = synchronizeMarkdownEditorSession(session, "locale:B", "body B");
  assert.equal(session.markdown, "body B");
  session = editMarkdownEditorSession(session, "draft B");
  session = synchronizeMarkdownEditorSession(session, "locale:B", "draft B");

  session = synchronizeMarkdownEditorSession(session, "locale:A", "draft A");
  assert.deepEqual(session, {
    documentId: "locale:A",
    markdown: "draft A",
    externalValue: "draft A",
    dirty: false,
  });
});

test("a clean session accepts asynchronously loaded content for the same document", () => {
  const session = synchronizeMarkdownEditorSession(
    createMarkdownEditorSession("post:1", ""),
    "post:1",
    "loaded body",
  );

  assert.equal(session.markdown, "loaded body");
  assert.equal(session.dirty, false);
});

test("a conflicting same-document update does not overwrite active unsaved input", () => {
  let session = editMarkdownEditorSession(
    createMarkdownEditorSession("post:1", "server body"),
    "local unsaved body",
  );

  session = synchronizeMarkdownEditorSession(session, "post:1", "new server body");
  assert.equal(session.markdown, "local unsaved body");
  assert.equal(session.externalValue, "new server body");
  assert.equal(session.dirty, true);

  session = synchronizeMarkdownEditorSession(session, "post:1", "local unsaved body");
  assert.equal(session.markdown, "local unsaved body");
  assert.equal(session.dirty, false);
});

test("every embedded Markdown editor supplies an explicit document identity", async () => {
  const componentFiles = [
    "blueprint-upload.tsx",
    "catalog-manual-editors.tsx",
    "community-post-editor.tsx",
    "creator-editor.tsx",
    "localized-asset-editor.tsx",
    "mod-content-resource-editor.tsx",
    "mod-editor.tsx",
    "modpack-editor.tsx",
    "project-changelog-editor.tsx",
    "server-submission-wizard.tsx",
    "simple-project-editor.tsx",
  ];

  for (const file of componentFiles) {
    const source = await readFile(new URL(`../_components/${file}`, import.meta.url), "utf8");
    const embeddedEditors = [...source.matchAll(/<ToolsPlayground\b[\s\S]*?\/>/g)]
      .map((match) => match[0])
      .filter((markup) => /\bembedded\b/.test(markup));
    assert.ok(embeddedEditors.length > 0, `${file} must contain an embedded Markdown editor`);
    for (const markup of embeddedEditors) {
      assert.match(markup, /\bdocumentId=/, `${file} must identify each embedded Markdown document`);
    }
  }
});

test("controlled synchronization does not publish prop-driven resets as user edits", async () => {
  const source = await readFile(new URL("../_components/tools-playground.tsx", import.meta.url), "utf8");
  assert.match(source, /synchronizeMarkdownEditorSession/);
  assert.match(source, /const commitMarkdown = useCallback/);
  assert.doesNotMatch(source, /onChangeRef\.current\?\.\(markdown\)/);
});
