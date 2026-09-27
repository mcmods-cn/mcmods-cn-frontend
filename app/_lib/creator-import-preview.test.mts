import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("creator import remains a non-persistent preview until explicit save actions", async () => {
  const [editor, api, en, zh] = await Promise.all([
    readFile(new URL("../_components/creator-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("./community-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/en-US.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(editor, /setAvatarUrl\(imported\.avatarUrl\)/);
  assert.doesNotMatch(editor, /setAvatarFileId\(imported\.avatarFileId\)/);
  assert.match(editor, /setImportedAvatarPreviewUrl\(imported\.avatarUrl\)/);
  assert.match(editor, /setImportedMemberPreviews\(imported\.members\)/);
  assert.match(editor, /member\.externalRole[\s\S]*member\.suggestedRole/);
  assert.match(editor, /member\.permissionGranting/);
  assert.match(editor, /importAvatarPreviewOnly/);
  assert.match(editor, /importMemberPreviewHint/);

  const importType = api.slice(api.indexOf("export type CreatorImportResult"), api.indexOf("type CreatorClaimAttachment"));
  for (const persistentIdentity of ["avatarFileId", "creatorId", "roleId", "createdMembers"]) {
    assert.doesNotMatch(importType, new RegExp(persistentIdentity));
  }
  for (const previewFact of ["externalRole", "suggestedRoleCode", "permissionGranting", "profileUrl"]) {
    assert.match(importType, new RegExp(previewFact));
  }
  for (const locale of [en, zh]) {
    assert.match(locale, /importAvatarPreviewOnly/);
    assert.match(locale, /importMemberPreviewHint/);
    assert.match(locale, /importRoleGrantsAccess/);
    assert.match(locale, /importRoleDisplayOnly/);
  }
});
