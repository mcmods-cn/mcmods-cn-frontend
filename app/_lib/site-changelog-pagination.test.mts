import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./site-affairs-api.ts", import.meta.url), "utf8");
const publicPage = readFileSync(new URL("../_components/site-affairs-pages.tsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../_components/admin-site-affairs-panels.tsx", import.meta.url), "utf8");

test("site changelog APIs expose bounded opaque cursor pages", () => {
  assert.match(api, /type SiteChangelogPage/);
  assert.match(api, /hasMore: boolean/);
  assert.match(api, /nextCursor: string/);
  assert.match(api, /cursor=\$\{encodeURIComponent\(cursor\)\}/);
  assert.doesNotMatch(api, /site-affairs\/changelogs[^\n]*offset=/);
});

test("public and admin changelog panels navigate server cursors without fixed windows", () => {
  for (const source of [publicPage, adminPage]) {
    assert.match(source, /cursorHistory/);
    assert.match(source, /nextCursor/);
  }
	const changelogList = publicPage.slice(
		publicPage.indexOf("export function SiteChangelogListPage"),
		publicPage.indexOf("export function SiteChangelogDetailPage"),
	);
	assert.doesNotMatch(changelogList, /setOffset|offset === 0|offset \+ 30/);
  assert.doesNotMatch(adminPage, /apiRequest<\{ items: AdminChangelog\[\] \}>/);
});
