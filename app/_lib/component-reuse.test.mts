import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project editor applications reuse the shared file selection boundary", async () => {
  const source = await readFile(new URL("../_components/project-editor-application.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ FileDropZone \} from "\.\/file-drop-zone";/);
  assert.equal(source.match(/<FileDropZone\b/g)?.length, 1);
  assert.match(source, /disabled=\{uploading \|\| submitting \|\| submittedSuccessfully \|\| attachments\.length >= 10\}/);
  assert.match(source, /\n\s+multiple\n/);
  assert.equal(source.includes('type="file"'), false);
  assert.equal(source.match(/uploadUserFileToOSS\(/g)?.length, 1);
  assert.equal(source.match(/"project-editor-application"/g)?.length, 1);
});

test("creator claims reuse the shared file selection boundary", async () => {
  const source = await readFile(new URL("../_components/creator-detail.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ FileDropZone \} from "\.\/file-drop-zone";/);
  assert.equal(source.match(/<FileDropZone\b/g)?.length, 1);
  assert.match(source, /disabled=\{uploading \|\| submitting \|\| submittedSuccessfully \|\| proofFiles\.length >= claimMaximumFiles\}/);
  assert.match(source, /multiple title=/);
  assert.equal(source.includes('type="file"'), false);
  assert.equal(source.includes("fileInput"), false);
  assert.equal(source.match(/uploadUserFileToOSS\(/g)?.length, 1);
  assert.equal(source.match(/"creator-claim"/g)?.length, 1);
});
