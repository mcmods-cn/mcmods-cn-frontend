import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = [
  "../_components/admin-governance-shared.tsx",
  "../_components/admin-report-panel.tsx",
  "../_components/admin-ban-panel.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const zhCNSource = readFileSync(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8");
const enUSSource = readFileSync(new URL("../_locales/en-US.ts", import.meta.url), "utf8");

test("ban reason loading failures remain explicit and retryable", () => {
  assert.doesNotMatch(panelSource, /\.catch\(\(\) => \{ if \(active\) setItems\(\[\]\); \}\)/);
  for (const required of [
    "type BanReasonLoadState",
    "loading: boolean",
    "error: string",
    "reload: () => void",
    "banReasonsLoadFailed",
    "banReasonsLoading",
    "role=\"alert\"",
    "banReasons.reload",
  ]) {
    assert.match(panelSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panelSource, /disabled=\{[^}]*banReasons\.(?:loading|error)/);
});

test("ban reason failure and loading messages are localized", () => {
  for (const source of [zhCNSource, enUSSource]) {
    assert.match(source, /banReasonsLoading:/);
    assert.match(source, /banReasonsLoadFailed:/);
  }
});
