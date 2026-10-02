import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyMarkdownDraftSaveResult,
  createMarkdownDraftSaveCoordinator,
  issueMarkdownDraftSave,
  parseMarkdownDraftConflict,
  rebaseMarkdownDraftSaveCoordinator,
} from "./markdown-draft-save.mts";

test("save attempts carry one base revision and a strictly increasing editor sequence", () => {
  let coordinator = createMarkdownDraftSaveCoordinator(7);
  const first = issueMarkdownDraftSave(coordinator, "editor-session", "body A");
  coordinator = first.coordinator;
  const second = issueMarkdownDraftSave(coordinator, "editor-session", "body B");

  assert.deepEqual(first.request, {
    content: "body A",
    baseRevision: 7,
    saveSessionId: "editor-session",
    clientSequence: 1,
  });
  assert.equal(second.request.baseRevision, 7);
  assert.equal(second.request.clientSequence, 2);
});

test("a slow response from A cannot replace the save state already reported by B", () => {
  let coordinator = createMarkdownDraftSaveCoordinator(3);
  coordinator = issueMarkdownDraftSave(coordinator, "editor-session", "body A").coordinator;
  coordinator = issueMarkdownDraftSave(coordinator, "editor-session", "body B").coordinator;

  const fastB = applyMarkdownDraftSaveResult(coordinator, { clientSequence: 2, revision: 4 });
  assert.equal(fastB.isLatest, true);
  const slowA = applyMarkdownDraftSaveResult(fastB.coordinator, { clientSequence: 1, revision: 5 });
  assert.equal(slowA.isLatest, false);
  assert.equal(slowA.coordinator.revision, 5);
});

test("conflict snapshots parse strictly and can become the next explicit base", () => {
  const conflict = parseMarkdownDraftConflict({
    clientSequence: 2,
    content: "other tab",
    revision: 9,
    updatedAt: "2026-08-22T10:00:00Z",
  });
  assert.ok(conflict);
  assert.equal(conflict.content, "other tab");
  assert.equal(rebaseMarkdownDraftSaveCoordinator(createMarkdownDraftSaveCoordinator(7), conflict.revision).revision, 9);
  assert.equal(parseMarkdownDraftConflict({ content: "x", revision: -1, clientSequence: 1 }), null);
});

test("standalone playground cancels obsolete requests and exposes explicit conflict choices", async () => {
  const source = await readFile(new URL("../_components/tools-playground.tsx", import.meta.url), "utf8");
  assert.match(source, /draftSaveAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /issueMarkdownDraftSave/);
  assert.match(source, /markdownRef\.current !== requestedMarkdown/);
  assert.match(source, /MARKDOWN_DRAFT_CONFLICT/);
  assert.match(source, /tools\.playground\.keepLocalDraft/);
  assert.match(source, /tools\.playground\.useServerDraft/);
  assert.doesNotMatch(source, /body: JSON\.stringify\(\{ content: markdown \}\)/);
});
