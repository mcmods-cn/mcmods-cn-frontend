import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { creatorProfilePayload } from "./creator-capabilities.mts";

test("creator UI renders profile, member, and role controls from distinct capabilities", async () => {
  const [api, detail, editor, manager, route] = await Promise.all([
    readFile(new URL("./community-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../_components/creator-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/creator-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/creator-member-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../teams/[publicId]/members/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const capability of ["canEditProfile", "canManageMembers", "canCreateRoles"]) {
    assert.match(api, new RegExp(`${capability}: boolean`));
  }
  assert.match(detail, /record\.canEditProfile/);
  assert.match(detail, /record\.canManageMembers/);
  assert.match(editor, /creatorProfilePayload/);
  assert.doesNotMatch(editor, /detail!\.creator\.publicId[^\n]+JSON\.stringify\(snapshot\)/);
  assert.match(manager, /detail\.canManageMembers/);
  assert.match(manager, /detail\.canCreateRoles/);
  assert.match(manager, /\/members/);
  assert.match(route, /CreatorMemberManager/);
});

test("creator profile payload cannot carry sensitive team memberships", () => {
  const payload = creatorProfilePayload({
    kind: "team",
    name: "Example",
    descriptionMarkdown: "",
    defaultLocale: "en-US",
    localizations: [],
    avatarUrl: "",
    links: [],
    members: [{ creatorId: "author001", roleId: "role00001", title: "Owner" }],
  });
  assert.equal("members" in payload, false);
});
