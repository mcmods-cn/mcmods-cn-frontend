import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(new URL("../_components/unified-report-dialog.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../_components/modpack-detail.tsx", import.meta.url), "utf8");
const english = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");

test("modpack detail participates in the unified report contract", () => {
  assert.match(dialog, /\| "modpack"/);
  assert.match(detail, /import \{ UnifiedReportButton \} from "\.\/unified-report-dialog"/);
  assert.match(detail, /targetId=\{record\.id\} targetSummary=\{displayName\} targetType="modpack"/);
  assert.match(english, /targets: \{[^\n]+modpack: "Modpack"/);
  assert.match(chinese, /targets: \{[^\n]+modpack: "整合包"/);
});
