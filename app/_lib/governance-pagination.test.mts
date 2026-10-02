import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { normalizeBlackroomStatus } from "./blackroom-status.ts";

const api = readFileSync(
  new URL("./site-affairs-api.ts", import.meta.url),
  "utf8",
);
const publicPages = readFileSync(
  new URL("../_components/site-affairs-pages.tsx", import.meta.url),
  "utf8",
);
const reportPanel = readFileSync(
  new URL("../_components/admin-report-panel.tsx", import.meta.url),
  "utf8",
);
const banPanel = readFileSync(
  new URL("../_components/admin-ban-panel.tsx", import.meta.url),
  "utf8",
);

test("blackroom API and public page use opaque cursor navigation", () => {
  assert.match(api, /type BlackroomPage/);
  assert.match(api, /hasMore: boolean/);
  assert.match(api, /nextCursor: string/);
  assert.match(api, /loadBlackroom\(cursor = ""\)/);
  assert.match(api, /cursor=\$\{encodeURIComponent\(cursor\)\}/);

  const list = publicPages.slice(
    publicPages.indexOf("export function BlackroomListPage"),
    publicPages.indexOf("export function BlackroomDetailPage"),
  );
  assert.match(list, /cursorHistory/);
  assert.match(list, /nextCursor/);
  assert.doesNotMatch(list, /offset|setOffset/);
});

test("report and ban administration navigate bounded cursor pages", () => {
  const reports = reportPanel;
  const bans = banPanel;
  for (const source of [reports, bans]) {
    assert.match(source, /cursorHistory/);
    assert.match(source, /nextCursor/);
    assert.match(source, /common\.previous/);
    assert.match(source, /common\.next/);
    assert.doesNotMatch(source, /offset=/);
  }
  assert.match(reports, /setCursorHistory\(\[\]\)/);
});

test("blackroom status is normalized to a closed runtime contract", () => {
  for (const status of ["temporary", "permanent", "released"] as const) {
    assert.equal(normalizeBlackroomStatus(status), status);
  }
  for (const unknown of ["revoked", "typo", "", null, 1]) {
    assert.equal(normalizeBlackroomStatus(unknown), "unknown");
  }
  assert.doesNotMatch(
    api,
    /"temporary"\s*\|\s*"permanent"\s*\|\s*"released"\s*\|\s*string/,
  );
  assert.match(api, /items: page\.items\.map\(normalizeBlackroomRecord\)/);
  assert.match(banPanel, /status: normalizeBlackroomStatus\(item\.status\)/);
  assert.match(banPanel, /internalNote: string/);
  assert.match(banPanel, /moderatorName: string/);
  assert.match(banPanel, /revokeReason: string/);
});

test("governance administration is split along domain boundaries", () => {
  const boundaries = [
    {
      path: "../_components/admin-report-panel.tsx",
      required: ["UnifiedReport"],
      forbidden: [
        "BanAdmin",
        "AboutAdmin",
        "SiteChangelogAdmin",
        "SeedCrawlerAdmin",
        "ProjectAutomationAdmin",
      ],
    },
    {
      path: "../_components/admin-ban-panel.tsx",
      required: ["BanAdmin"],
      forbidden: [
        "UnifiedReport",
        "AboutAdmin",
        "SiteChangelogAdmin",
        "SeedCrawlerAdmin",
        "ProjectAutomationAdmin",
      ],
    },
    {
      path: "../_components/admin-site-affairs-panels.tsx",
      required: ["AboutAdmin", "SiteChangelogAdmin"],
      forbidden: [
        "UnifiedReport",
        "BanAdmin",
        "SeedCrawlerAdmin",
        "ProjectAutomationAdmin",
      ],
    },
    {
      path: "../_components/admin-automation-panels.tsx",
      required: ["SeedCrawlerAdmin", "ProjectAutomationAdmin"],
      forbidden: [
        "UnifiedReport",
        "BanAdmin",
        "AboutAdmin",
        "SiteChangelogAdmin",
      ],
    },
    {
      path: "../_components/admin-governance-shared.tsx",
      required: ["PanelHeader", "RecordTable"],
      forbidden: [
        "UnifiedReport",
        "BanAdmin",
        "AboutAdmin",
        "SiteChangelogAdmin",
        "SeedCrawlerAdmin",
        "ProjectAutomationAdmin",
      ],
    },
  ];
  for (const boundary of boundaries) {
    const moduleURL = new URL(boundary.path, import.meta.url);
    assert.equal(existsSync(moduleURL), true, `${boundary.path} is missing`);
    const source = readFileSync(moduleURL, "utf8");
    const longestLine = Math.max(
      ...source.split(/\r?\n/).map((line) => line.length),
    );
    assert.ok(
      longestLine <= 180,
      `${boundary.path} retains a compressed ${longestLine}-character line`,
    );
    for (const symbol of boundary.required)
      assert.match(source, new RegExp(symbol));
    for (const symbol of boundary.forbidden)
      assert.doesNotMatch(source, new RegExp(symbol));
  }
  assert.equal(
    existsSync(
      new URL(
        "../_components/admin-governance-automation-panels.tsx",
        import.meta.url,
      ),
    ),
    false,
  );
});
