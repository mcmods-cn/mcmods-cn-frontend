import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseLocalizedContentVersion,
  parseOptionalPublishedReviewStatus,
  parsePublishedReviewStatus,
  parseReviewStatus,
  parseTranslationProvenance,
} from "./localization-boundary.mts";

const domainModules = [
  "catalog-editor-api.ts",
  "catalog-resource-api.ts",
  "editor-api.ts",
  "recipe-editor-api.ts",
];

test("localization API modules share one strict response boundary", async () => {
  const sources = await Promise.all(domainModules.map((name) => readFile(new URL(name, import.meta.url), "utf8")));
  for (const source of sources) assert.match(source, /from "\.\/localization-boundary\.mts"/);
  assert.equal(sources.filter((source) => /parseLocalizedContentVersions?\(/.test(source)).length, domainModules.length);
  assert.equal(sources.some((source) => /function (normalizeProvenance|normalizeReviewStatus|reviewStatus|localizations|normalizeLocalizations)\b/.test(source)), false);
  assert.equal(sources.some((source) => /\?[^:\n]+:[^\n]+"approved"|\?\? "approved"/.test(source)), false);
});

test("review status parsers accept the complete explicit enums and reject protocol drift", () => {
  assert.deepEqual(["draft", "pending", "approved", "rejected"].map((value) => parseReviewStatus(value)), ["draft", "pending", "approved", "rejected"]);
  assert.deepEqual(["pending", "approved", "rejected"].map((value) => parsePublishedReviewStatus(value)), ["pending", "approved", "rejected"]);
  assert.equal(parseOptionalPublishedReviewStatus(undefined), undefined);
  assert.throws(() => parseReviewStatus("new_state"), /Invalid API reviewStatus/);
  assert.throws(() => parseReviewStatus(undefined), /Invalid API reviewStatus/);
  assert.throws(() => parsePublishedReviewStatus("draft"), /Invalid API reviewStatus/);
});

test("localization parser preserves every valid provenance and fails closed on malformed facts", () => {
  const base = { locale: "zh-CN", name: "名称", summary: "摘要", contentMarkdown: "正文", reviewStatus: "approved" };
  for (const provenance of ["original", "import", "human", "ai", "human_corrected"]) {
    assert.equal(parseTranslationProvenance(provenance), provenance);
    assert.equal(parseLocalizedContentVersion({ ...base, provenance }).provenance, provenance);
  }
  assert.throws(() => parseLocalizedContentVersion({ ...base, provenance: "machine" }), /localization\.provenance/);
  assert.throws(() => parseLocalizedContentVersion({ ...base, provenance: "human", reviewStatus: "unknown" }), /localization\.reviewStatus/);
  assert.throws(() => parseLocalizedContentVersion({ ...base, provenance: "human", locale: "" }), /localization\.locale/);
});
